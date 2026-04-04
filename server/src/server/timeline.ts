import type {
    ObservedEvent,
    ObservedRunSummary,
    ObservedSpan,
    RelatedRunPayload,
    RelatedRunTimelineStep,
    StepNode,
    TokenSummary,
    TokenUsage,
    WaterfallEntry,
} from "@/src/server/contracts";

// ---------------------------------------------------------------------------
// Legacy flat timeline (kept for backward-compat in the API response)
// ---------------------------------------------------------------------------

interface TimelineEvent {
    step_id: string;
    type: string;
    timestamp: string | null;
    sortValue: number;
    content: string;
}

function toSortValue(timestamp: string | null | undefined): number {
    if (!timestamp) {
        return Number.MAX_SAFE_INTEGER;
    }

    const value = new Date(timestamp).getTime();
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function previewToString(value: unknown): string | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    if (typeof value === "string") {
        return value;
    }

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export function buildRelatedRun(
    run: ObservedRunSummary,
    spans: ObservedSpan[],
    events: ObservedEvent[] = [],
): RelatedRunPayload {
    const timeline: TimelineEvent[] = [];

    timeline.push({
        step_id: `run-start-${run.run_id}`,
        type: "RUN_STARTED",
        timestamp: run.started_at || run.created_at || null,
        sortValue: toSortValue(run.started_at || run.created_at),
        content: run.task_name
            ? `Run started for ${run.task_name}`
            : "Run started",
    });

    spans.forEach((span) => {
        timeline.push({
            step_id: `span-start-${span.span_id}`,
            type: "SPAN_STARTED",
            timestamp: span.started_at || null,
            sortValue: toSortValue(span.started_at),
            content: `${span.name} (${span.run_type}) started`,
        });

        timeline.push({
            step_id: `span-finish-${span.span_id}`,
            type: `SPAN_${span.status}`,
            timestamp: span.finished_at || span.started_at || null,
            sortValue: toSortValue(span.finished_at || span.started_at),
            content:
                previewToString(span.output_preview) ||
                span.error ||
                `${span.name} finished with status ${span.status}`,
        });
    });

    events.forEach((event, index) => {
        const label = event.message || event.name || previewToString(event.data);
        timeline.push({
            step_id: `event-${event.id || index}`,
            type: String(event.level || event.type || "EVENT"),
            timestamp: event.timestamp,
            sortValue: toSortValue(event.timestamp),
            content: label || "Event emitted",
        });
    });

    if (run.latest_event) {
        timeline.push({
            step_id: `run-latest-event-${run.run_id}`,
            type: "RUN_EVENT",
            timestamp:
                run.updated_at || run.finished_at || run.started_at || null,
            sortValue: toSortValue(
                run.updated_at || run.finished_at || run.started_at,
            ),
            content: run.latest_event,
        });
    }

    timeline.push({
        step_id: `run-finish-${run.run_id}`,
        type: `RUN_${run.status}`,
        timestamp: run.finished_at || run.updated_at || run.started_at || null,
        sortValue: toSortValue(
            run.finished_at || run.updated_at || run.started_at,
        ),
        content:
            previewToString(run.output_preview) ||
            run.error ||
            `Run finished with status ${run.status}`,
    });

    const sortedTimeline = timeline
        .sort(
            (left, right) =>
                left.sortValue - right.sortValue ||
                left.step_id.localeCompare(right.step_id),
        )
        .map<RelatedRunTimelineStep>(
            ({ step_id, type, timestamp, content }) => ({
                step_id,
                type,
                timestamp,
                content,
            }),
        );

    return {
        run_id: run.run_id,
        session_id: run.session_id,
        status: run.status,
        timeline: sortedTimeline,
    };
}

// ---------------------------------------------------------------------------
// Structured step tree (spans + their events)
// ---------------------------------------------------------------------------

export function buildStepTree(
    spans: ObservedSpan[],
    events: ObservedEvent[],
): StepNode[] {
    const eventsBySpan = new Map<string, ObservedEvent[]>();
    const orphanEvents: ObservedEvent[] = [];
    for (const event of events) {
        if (event.type === "log") continue;
        if (event.span_id) {
            let list = eventsBySpan.get(event.span_id);
            if (!list) {
                list = [];
                eventsBySpan.set(event.span_id, list);
            }
            list.push(event);
        } else {
            orphanEvents.push(event);
        }
    }

    const nodeById = new Map<string, StepNode>();
    const roots: StepNode[] = [];

    for (const span of spans) {
        nodeById.set(span.span_id, {
            span,
            events: eventsBySpan.get(span.span_id) ?? [],
            children: [],
        });
    }

    nodeById.forEach((node) => {
        const parentId = node.span.parent_span_id;
        if (parentId && nodeById.has(parentId)) {
            nodeById.get(parentId)!.children.push(node);
        } else {
            roots.push(node);
        }
    });

    return roots;
}

// ---------------------------------------------------------------------------
// Waterfall entries (for Gantt-like timeline)
// ---------------------------------------------------------------------------

export function buildWaterfall(
    spans: ObservedSpan[],
    runStartedAt: string | null | undefined,
): WaterfallEntry[] {
    const baseMs = runStartedAt
        ? new Date(runStartedAt).getTime()
        : spans.length > 0 && spans[0].started_at
            ? new Date(spans[0].started_at).getTime()
            : 0;

    const depthMap = new Map<string, number>();
    const entries: WaterfallEntry[] = [];

    function resolveDepth(span: ObservedSpan): number {
        const cached = depthMap.get(span.span_id);
        if (cached !== undefined) return cached;

        if (!span.parent_span_id) {
            depthMap.set(span.span_id, 0);
            return 0;
        }

        const parentSpan = spanById.get(span.parent_span_id);
        const depth = parentSpan ? resolveDepth(parentSpan) + 1 : 0;
        depthMap.set(span.span_id, depth);
        return depth;
    }

    const spanById = new Map<string, ObservedSpan>();
    for (const span of spans) {
        spanById.set(span.span_id, span);
    }

    for (const span of spans) {
        const startMs = span.started_at
            ? new Date(span.started_at).getTime() - baseMs
            : 0;
        const endMs = span.finished_at
            ? new Date(span.finished_at).getTime() - baseMs
            : span.started_at
                ? new Date(span.started_at).getTime() - baseMs
                : 0;

        entries.push({
            span_id: span.span_id,
            parent_span_id: span.parent_span_id,
            name: span.name,
            run_type: span.run_type,
            status: span.status,
            start_ms: Math.max(0, startMs),
            duration_ms: Math.max(0, endMs - startMs),
            depth: resolveDepth(span),
        });
    }

    entries.sort((a, b) => a.start_ms - b.start_ms);
    return entries;
}

// ---------------------------------------------------------------------------
// Token summary (aggregated from span metadata)
// ---------------------------------------------------------------------------

const EMPTY_USAGE: TokenUsage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
};

function addUsage(target: TokenUsage, source: TokenUsage): void {
    target.prompt_tokens += source.prompt_tokens;
    target.completion_tokens += source.completion_tokens;
    target.total_tokens += source.total_tokens;
}

export function buildTokenSummary(spans: ObservedSpan[]): TokenSummary {
    const total: TokenUsage = { ...EMPTY_USAGE };
    const byModel: Record<string, TokenUsage> = {};

    for (const span of spans) {
        if (span.run_type !== "llm") continue;

        const meta = span.metadata as Record<string, unknown> | null;
        if (!meta) continue;

        const usage = meta.usage as Record<string, number> | undefined;
        if (!usage) continue;

        const u: TokenUsage = {
            prompt_tokens: usage.prompt_tokens ?? 0,
            completion_tokens: usage.completion_tokens ?? 0,
            total_tokens: usage.total_tokens ?? 0,
        };

        addUsage(total, u);

        const model = (meta.model as string) || "unknown";
        if (!byModel[model]) {
            byModel[model] = { ...EMPTY_USAGE };
        }
        addUsage(byModel[model], u);
    }

    return { total, by_model: byModel };
}
