import type {
    ObservedRunDetailResponse,
    RunSearchFilters,
    RunSearchResponse,
    RunsListResponse,
    RunStatsResponse,
} from "@/src/server/contracts";
import { getQueueSnapshot } from "@/src/server/queue";
import { parseSearchQuery } from "@/src/server/search";
import {
    getRunLLMStats,
    getRunStatsBucketed,
    getRun,
    listRunEvents,
    listRunsPaginated,
    listRunSpans,
    searchRuns,
} from "@/src/server/store";
import {
    buildRelatedRun,
    buildStepTree,
    buildTokenSummary,
    buildWaterfall,
} from "@/src/server/timeline";

// ---------------------------------------------------------------------------
// Paginated runs
// ---------------------------------------------------------------------------

export async function getRunsPage(params: {
    page: number;
    pageSize: number;
    from?: string;
    to?: string;
    status?: string[];
    agentName?: string;
    text?: string;
}): Promise<RunsListResponse> {
    const { runs, total } = await listRunsPaginated(params);
    const runIds = runs.map((r) => r.run_id);
    const llmStats = await getRunLLMStats(runIds);

    return {
        runs: runs.map((r) => ({
            ...r,
            total_tokens: llmStats.tokensPerRun.get(r.run_id) ?? 0,
            models: llmStats.modelsPerRun.get(r.run_id) ?? [],
        })),
        total,
        page: params.page,
        pageSize: params.pageSize,
        totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
}

// ---------------------------------------------------------------------------
// Chart stats
// ---------------------------------------------------------------------------

export async function getRunChartStats(
    from: string,
    to: string,
): Promise<RunStatsResponse> {
    return getRunStatsBucketed(from, to);
}

// ---------------------------------------------------------------------------
// Run detail
// ---------------------------------------------------------------------------

export async function getObservedRunDetail(
    runId: string,
): Promise<ObservedRunDetailResponse | null> {
    const run = await getRun(runId);
    if (!run) {
        return null;
    }

    const [spans, events] = await Promise.all([
        listRunSpans(runId),
        listRunEvents(runId),
    ]);
    const queue = await getQueueSnapshot(
        run.queue_name ? [run.queue_name] : [],
    );

    const logs = events.filter((e) => e.type === "log");

    return {
        run,
        spans,
        events,
        related_run: buildRelatedRun(run, spans, events),
        queue,
        steps: buildStepTree(spans, events),
        waterfall: buildWaterfall(spans, run.started_at),
        token_summary: buildTokenSummary(spans),
        logs,
    };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

async function enrichSearchResults(
    filters: RunSearchFilters,
    runs: Awaited<ReturnType<typeof searchRuns>>,
): Promise<RunSearchResponse> {
    const runIds = runs.map((r) => r.run_id);
    const llmStats = await getRunLLMStats(runIds);

    return {
        filters,
        results: {
            runs: runs.map((r) => ({
                ...r,
                total_tokens: llmStats.tokensPerRun.get(r.run_id) ?? 0,
            })),
            total: runs.length,
            page: 1,
            pageSize: runs.length,
            totalPages: 1,
        },
    };
}

export async function searchRunsByNaturalLanguage(
    query: string,
    timezone?: string,
): Promise<RunSearchResponse> {
    const filters = await parseSearchQuery(query, timezone);
    const runs = await searchRuns(filters);
    return enrichSearchResults(filters, runs);
}

export async function searchRunsByFilters(
    filters: RunSearchFilters,
): Promise<RunSearchResponse> {
    const runs = await searchRuns(filters);
    return enrichSearchResults(filters, runs);
}
