import { Prisma } from "@/src/generated/prisma/client";
import { prisma } from "@/src/lib/prisma";
import type { Run, Span, Event as PrismaEvent } from "@/src/generated/prisma/client";
import type {
    AgentSummary,
    ObservedEvent,
    ObservedRunSummary,
    ObservedSpan,
    RunSearchFilters,
    SessionSummary,
} from "@/src/server/contracts";

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function toJsonInput(
    value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
    if (value === null || value === undefined) return undefined;
    return value as Prisma.InputJsonValue;
}

function toJsonInputOrNull(
    value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

function serializeRun(row: Run): ObservedRunSummary {
    return {
        run_id: row.id,
        session_id: row.sessionId,
        task_name: row.taskName,
        queue_name: row.queueName,
        worker_name: row.workerName,
        status: row.status,
        error: row.error,
        input_preview: row.inputPreview,
        output_preview: row.outputPreview,
        latest_span_name: row.latestSpanName,
        latest_span_type: row.latestSpanType,
        latest_event: row.latestEvent,
        root_span_id: row.rootSpanId,
        total_spans: row.totalSpans,
        active_span_count: row.activeSpanCount,
        enqueued_at: row.enqueuedAt?.toISOString() ?? null,
        started_at: row.startedAt?.toISOString() ?? null,
        finished_at: row.finishedAt?.toISOString() ?? null,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
        summary: asRecord(row.summary),
        metadata: asRecord(row.metadata),
    };
}

function serializeSpan(row: Span): ObservedSpan {
    return {
        span_id: row.id,
        parent_span_id: row.parentSpanId,
        agent_name: row.agentName,
        name: row.name,
        run_type: row.runType,
        status: row.status ?? "UNKNOWN",
        started_at: row.startedAt?.toISOString() ?? null,
        finished_at: row.finishedAt?.toISOString() ?? null,
        input_preview: row.inputPreview,
        output_preview: row.outputPreview,
        error: row.error,
        metadata: asRecord(row.metadata),
        tags: row.tags,
    };
}

function serializeEvent(row: PrismaEvent): ObservedEvent {
    return {
        id: row.id,
        span_id: row.spanId,
        run_id: row.runId,
        type: row.type,
        name: row.name,
        message: row.message,
        level: row.level,
        data: asRecord(row.data),
        timestamp: row.timestamp.toISOString(),
    };
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function listRecentRuns(
    limit: number,
): Promise<ObservedRunSummary[]> {
    const rows = await prisma.run.findMany({
        where: { isDeleted: false },
        orderBy: { createdAt: "desc" },
        take: limit,
    });
    return rows.map(serializeRun);
}

export async function listRunsByTimeRange(
    from: string,
    to: string,
): Promise<ObservedRunSummary[]> {
    const rows = await prisma.run.findMany({
        where: {
            isDeleted: false,
            startedAt: {
                gte: new Date(from),
                lte: new Date(to),
            },
        },
        orderBy: { startedAt: "desc" },
        take: 10000,
    });
    return rows.map(serializeRun);
}

export async function getRun(
    runId: string,
): Promise<ObservedRunSummary | null> {
    const row = await prisma.run.findFirst({
        where: { id: runId, isDeleted: false },
    });
    return row ? serializeRun(row) : null;
}

export async function listRunSpans(runId: string): Promise<ObservedSpan[]> {
    const rows = await prisma.span.findMany({
        where: { runId },
        orderBy: { createdAt: "asc" },
    });
    return rows.map(serializeSpan);
}

export async function listRunEvents(runId: string): Promise<ObservedEvent[]> {
    const rows = await prisma.event.findMany({
        where: { runId },
        orderBy: { timestamp: "asc" },
    });
    return rows.map(serializeEvent);
}

export async function listSpanEvents(
    spanId: string,
): Promise<ObservedEvent[]> {
    const rows = await prisma.event.findMany({
        where: { spanId },
        orderBy: { timestamp: "asc" },
    });
    return rows.map(serializeEvent);
}

export async function listAgents(): Promise<AgentSummary[]> {
    const rows = await prisma.agent.findMany({
        orderBy: { updatedAt: "desc" },
    });
    const spanCounts = await prisma.span.groupBy({
        by: ["agentName"],
        _count: true,
        where: { agentName: { in: rows.map((r) => r.name) } },
    });
    const countMap = new Map(spanCounts.map((c) => [c.agentName, c._count]));
    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        version: r.version,
        metadata: asRecord(r.metadata),
        registered_at: r.registeredAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
        total_spans: countMap.get(r.name) ?? 0,
    }));
}

export async function getAgent(name: string): Promise<AgentSummary | null> {
    const row = await prisma.agent.findUnique({ where: { name } });
    if (!row) return null;
    const spanCount = await prisma.span.count({ where: { agentName: name } });
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        version: row.version,
        metadata: asRecord(row.metadata),
        registered_at: row.registeredAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
        total_spans: spanCount,
    };
}

function deriveSessionStatus(statuses: string[]): { status: string; latest: string | null } {
    if (statuses.length === 0) return { status: "empty", latest: null };
    const latest = statuses[0] ?? null;
    if (statuses.some((s) => s === "RUNNING" || s === "PENDING")) return { status: "active", latest };
    if (statuses.every((s) => s === "SUCCESS")) return { status: "success", latest };
    if (statuses.some((s) => s === "FAILURE" || s === "ABORTED")) return { status: "failure", latest };
    return { status: "unknown", latest };
}

export interface SessionFilters {
    status?: string;
    userId?: string;
    search?: string;
    from?: string;
    to?: string;
}

export async function listSessions(
    limit: number,
    filters?: SessionFilters,
): Promise<SessionSummary[]> {
    const where: Prisma.SessionWhereInput = {};
    if (filters?.userId) {
        where.userId = filters.userId;
    }
    if (filters?.search) {
        where.OR = [
            { id: { contains: filters.search, mode: "insensitive" } },
            { name: { contains: filters.search, mode: "insensitive" } },
        ];
    }
    if (filters?.from || filters?.to) {
        where.startedAt = {};
        if (filters.from) where.startedAt.gte = new Date(filters.from);
        if (filters.to) where.startedAt.lte = new Date(filters.to);
    }

    const rows = await prisma.session.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit,
    });

    const sessionIds = rows.map((r) => r.id);

    const runCounts = await prisma.run.groupBy({
        by: ["sessionId"],
        _count: true,
        where: { sessionId: { in: sessionIds } },
    });
    const countMap = new Map(runCounts.map((c) => [c.sessionId, c._count]));

    const runStatuses = await prisma.run.findMany({
        where: { sessionId: { in: sessionIds }, isDeleted: false },
        select: { sessionId: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
    });
    const statusesBySession = new Map<string, string[]>();
    for (const r of runStatuses) {
        if (!r.sessionId) continue;
        const arr = statusesBySession.get(r.sessionId) ?? [];
        arr.push(r.status);
        statusesBySession.set(r.sessionId, arr);
    }

    let results = rows.map((r) => {
        const { status, latest } = deriveSessionStatus(statusesBySession.get(r.id) ?? []);
        return {
            id: r.id,
            name: r.name,
            user_id: r.userId,
            user_data: asRecord(r.userData),
            metadata: asRecord(r.metadata),
            started_at: r.startedAt.toISOString(),
            updated_at: r.updatedAt.toISOString(),
            run_count: countMap.get(r.id) ?? 0,
            status,
            latest_run_status: latest,
        };
    });

    if (filters?.status) {
        results = results.filter((s) => s.status === filters.status);
    }

    return results;
}

export async function getSession(
    sessionId: string,
): Promise<SessionSummary | null> {
    const row = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!row) return null;

    const runs = await prisma.run.findMany({
        where: { sessionId, isDeleted: false },
        select: { status: true },
        orderBy: { createdAt: "desc" },
    });
    const { status, latest } = deriveSessionStatus(runs.map((r) => r.status));

    return {
        id: row.id,
        name: row.name,
        summary: row.summary,
        user_id: row.userId,
        user_data: asRecord(row.userData),
        metadata: asRecord(row.metadata),
        started_at: row.startedAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
        run_count: runs.length,
        status,
        latest_run_status: latest,
    };
}

export async function listSessionRuns(
    sessionId: string,
): Promise<ObservedRunSummary[]> {
    const rows = await prisma.run.findMany({
        where: { sessionId, isDeleted: false },
        orderBy: { createdAt: "desc" },
    });
    return rows.map(serializeRun);
}

export interface SessionStats {
    total_duration_ms: number | null;
    total_tokens: number;
    total_spans: number;
    success_count: number;
    failure_count: number;
}

export async function getSessionStats(sessionId: string): Promise<SessionStats> {
    const runs = await prisma.run.findMany({
        where: { sessionId, isDeleted: false },
        select: {
            id: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            totalSpans: true,
        },
    });

    let earliestStart: number | null = null;
    let latestFinish: number | null = null;
    let totalSpans = 0;
    let successCount = 0;
    let failureCount = 0;

    for (const run of runs) {
        totalSpans += run.totalSpans;
        if (run.status === "SUCCESS") successCount++;
        if (run.status === "FAILURE" || run.status === "ABORTED") failureCount++;

        if (run.startedAt) {
            const t = run.startedAt.getTime();
            if (earliestStart === null || t < earliestStart) earliestStart = t;
        }
        if (run.finishedAt) {
            const t = run.finishedAt.getTime();
            if (latestFinish === null || t > latestFinish) latestFinish = t;
        }
    }

    const totalDurationMs =
        earliestStart !== null && latestFinish !== null
            ? latestFinish - earliestStart
            : null;

    const runIds = runs.map((r) => r.id);
    let totalTokens = 0;
    if (runIds.length > 0) {
        const tokenResult = await prisma.$queryRaw<{ total: bigint }[]>`
            SELECT COALESCE(SUM((metadata->'usage'->>'total_tokens')::int), 0) as total
            FROM spans
            WHERE run_id = ANY(${runIds})
              AND run_type = 'llm'
              AND metadata->'usage'->>'total_tokens' IS NOT NULL
        `;
        totalTokens = Number(tokenResult[0]?.total ?? 0);
    }

    return {
        total_duration_ms: totalDurationMs,
        total_tokens: totalTokens,
        total_spans: totalSpans,
        success_count: successCount,
        failure_count: failureCount,
    };
}

export interface RunLLMStats {
    totalTokens: number;
    tokensPerRun: Map<string, number>;
    modelsPerRun: Map<string, string[]>;
}

export async function getRunLLMStats(runIds: string[]): Promise<RunLLMStats> {
    if (runIds.length === 0) {
        return { totalTokens: 0, tokensPerRun: new Map(), modelsPerRun: new Map() };
    }

    const rows = await prisma.$queryRaw<
        { run_id: string; total_tokens: bigint; models: string[] }[]
    >`
        SELECT
            run_id,
            COALESCE(SUM((metadata->'usage'->>'total_tokens')::int) FILTER (
                WHERE metadata->'usage'->>'total_tokens' IS NOT NULL
            ), 0) AS total_tokens,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT metadata->>'model') FILTER (
                WHERE metadata->>'model' IS NOT NULL
            ), NULL) AS models
        FROM spans
        WHERE run_id = ANY(${runIds})
          AND run_type = 'llm'
        GROUP BY run_id
    `;

    let totalTokens = 0;
    const tokensPerRun = new Map<string, number>();
    const modelsPerRun = new Map<string, string[]>();
    for (const r of rows) {
        const tokens = Number(r.total_tokens);
        totalTokens += tokens;
        tokensPerRun.set(r.run_id, tokens);
        if (r.models?.length) {
            modelsPerRun.set(r.run_id, r.models);
        }
    }

    return { totalTokens, tokensPerRun, modelsPerRun };
}

// ---------------------------------------------------------------------------
// Paginated listing
// ---------------------------------------------------------------------------

export async function listRunsPaginated(params: {
    page: number;
    pageSize: number;
    from?: string;
    to?: string;
    status?: string[];
    agentName?: string;
    text?: string;
}): Promise<{ runs: ObservedRunSummary[]; total: number }> {
    const where: Prisma.RunWhereInput = { isDeleted: false };

    if (params.from || params.to) {
        where.startedAt = {};
        if (params.from) where.startedAt.gte = new Date(params.from);
        if (params.to) where.startedAt.lte = new Date(params.to);
    }
    if (params.status?.length) {
        where.status = { in: params.status };
    }
    if (params.agentName) {
        where.taskName = { contains: params.agentName, mode: "insensitive" };
    }
    if (params.text) {
        where.OR = [
            { taskName: { contains: params.text, mode: "insensitive" } },
            { error: { contains: params.text, mode: "insensitive" } },
            { workerName: { contains: params.text, mode: "insensitive" } },
        ];
    }

    const offset = (params.page - 1) * params.pageSize;

    const [rows, total] = await Promise.all([
        prisma.run.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: offset,
            take: params.pageSize,
        }),
        prisma.run.count({ where }),
    ]);

    return { runs: rows.map(serializeRun), total };
}

// ---------------------------------------------------------------------------
// Stats bucketed (for charts)
// ---------------------------------------------------------------------------

export async function getRunStatsBucketed(
    from: string,
    to: string,
): Promise<{
    buckets: { time: string; total: number; success: number; failed: number; running: number }[];
    totals: { runs: number; running: number; failed: number; tokens: number };
}> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const bucketRows = await prisma.$queryRaw<
        { bucket: Date; total: bigint; success: bigint; failed: bigint; running: bigint }[]
    >`
        SELECT
            DATE_TRUNC('hour', started_at) AS bucket,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success,
            COUNT(*) FILTER (WHERE status IN ('FAILURE', 'ABORTED')) AS failed,
            COUNT(*) FILTER (WHERE status = 'RUNNING') AS running
        FROM runs
        WHERE is_deleted = false
          AND started_at >= ${fromDate}
          AND started_at <= ${toDate}
        GROUP BY bucket
        ORDER BY bucket
    `;

    const totalsRow = await prisma.$queryRaw<
        [{ runs: bigint; running: bigint; failed: bigint }]
    >`
        SELECT
            COUNT(*) AS runs,
            COUNT(*) FILTER (WHERE status = 'RUNNING') AS running,
            COUNT(*) FILTER (WHERE status IN ('FAILURE', 'ABORTED')) AS failed
        FROM runs
        WHERE is_deleted = false
          AND started_at >= ${fromDate}
          AND started_at <= ${toDate}
    `;

    const tokenRow = await prisma.$queryRaw<[{ total: bigint | null }]>`
        SELECT COALESCE(SUM((s.metadata->'usage'->>'total_tokens')::int), 0) AS total
        FROM spans s
        INNER JOIN runs r ON r.run_id = s.run_id
        WHERE r.is_deleted = false
          AND r.started_at >= ${fromDate}
          AND r.started_at <= ${toDate}
          AND s.run_type = 'llm'
          AND s.metadata->'usage'->>'total_tokens' IS NOT NULL
    `;

    return {
        buckets: bucketRows.map((r) => ({
            time: r.bucket.toISOString(),
            total: Number(r.total),
            success: Number(r.success),
            failed: Number(r.failed),
            running: Number(r.running),
        })),
        totals: {
            runs: Number(totalsRow[0]?.runs ?? 0),
            running: Number(totalsRow[0]?.running ?? 0),
            failed: Number(totalsRow[0]?.failed ?? 0),
            tokens: Number(tokenRow[0]?.total ?? 0),
        },
    };
}

// ---------------------------------------------------------------------------
// Search / filter operations
// ---------------------------------------------------------------------------

export async function searchRuns(
    filters: RunSearchFilters,
): Promise<ObservedRunSummary[]> {
    const conditions: string[] = ["r.is_deleted = false"];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.status?.length) {
        conditions.push(`r.status = ANY($${paramIdx}::text[])`);
        params.push(filters.status);
        paramIdx++;
    }

    if (filters.agent_name) {
        conditions.push(`r.task_name ILIKE '%' || $${paramIdx}::text || '%'`);
        params.push(filters.agent_name);
        paramIdx++;
    }

    if (filters.date_from) {
        conditions.push(`r.started_at >= $${paramIdx}::timestamptz`);
        params.push(new Date(filters.date_from));
        paramIdx++;
    }

    if (filters.date_to) {
        conditions.push(`r.started_at <= $${paramIdx}::timestamptz`);
        params.push(new Date(filters.date_to));
        paramIdx++;
    }

    if (filters.text) {
        const textParam = `$${paramIdx}::text`;
        conditions.push(
            `(r.task_name ILIKE '%' || ${textParam} || '%' OR r.error ILIKE '%' || ${textParam} || '%' OR r.worker_name ILIKE '%' || ${textParam} || '%')`,
        );
        params.push(filters.text);
        paramIdx++;
    }

    if (filters.min_duration_ms != null || filters.max_duration_ms != null) {
        const durationExpr =
            "EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) * 1000";
        conditions.push("r.finished_at IS NOT NULL");
        conditions.push("r.started_at IS NOT NULL");
        if (filters.min_duration_ms != null) {
            conditions.push(`${durationExpr} >= $${paramIdx}::double precision`);
            params.push(filters.min_duration_ms);
            paramIdx++;
        }
        if (filters.max_duration_ms != null) {
            conditions.push(`${durationExpr} <= $${paramIdx}::double precision`);
            params.push(filters.max_duration_ms);
            paramIdx++;
        }
    }

    if (filters.min_tokens != null || filters.max_tokens != null) {
        let havingClauses = "1=1";
        if (filters.min_tokens != null) {
            havingClauses += ` AND SUM((s.metadata->'usage'->>'total_tokens')::int) >= $${paramIdx}::int`;
            params.push(filters.min_tokens);
            paramIdx++;
        }
        if (filters.max_tokens != null) {
            havingClauses += ` AND SUM((s.metadata->'usage'->>'total_tokens')::int) <= $${paramIdx}::int`;
            params.push(filters.max_tokens);
            paramIdx++;
        }
        conditions.push(
            `r.run_id IN (
                SELECT s.run_id FROM spans s
                WHERE s.run_type = 'llm'
                  AND s.metadata->'usage'->>'total_tokens' IS NOT NULL
                GROUP BY s.run_id
                HAVING ${havingClauses}
            )`,
        );
    }

    const whereClause = conditions.join(" AND ");
    const query = `
        SELECT r.*
        FROM runs r
        WHERE ${whereClause}
        ORDER BY r.started_at DESC NULLS LAST
        LIMIT 500
    `;

    const rows = await prisma.$queryRawUnsafe<Run[]>(query, ...params);
    return rows.map(rawRowToRunSummary);
}

function rawRowToRunSummary(row: Record<string, unknown>): ObservedRunSummary {
    return {
        run_id: row.run_id as string,
        session_id: (row.session_id as string) ?? null,
        task_name: (row.task_name as string) ?? null,
        queue_name: (row.queue_name as string) ?? null,
        worker_name: (row.worker_name as string) ?? null,
        status: row.status as string,
        error: (row.error as string) ?? null,
        input_preview: row.input_preview ?? null,
        output_preview: row.output_preview ?? null,
        latest_span_name: (row.latest_span_name as string) ?? null,
        latest_span_type: (row.latest_span_type as string) ?? null,
        latest_event: (row.latest_event as string) ?? null,
        root_span_id: (row.root_span_id as string) ?? null,
        total_spans: Number(row.total_spans ?? 0),
        active_span_count: Number(row.active_span_count ?? 0),
        enqueued_at: row.enqueued_at instanceof Date ? row.enqueued_at.toISOString() : (row.enqueued_at as string) ?? null,
        started_at: row.started_at instanceof Date ? row.started_at.toISOString() : (row.started_at as string) ?? null,
        finished_at: row.finished_at instanceof Date ? row.finished_at.toISOString() : (row.finished_at as string) ?? null,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at as string) ?? null,
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at as string) ?? null,
        summary: row.summary && typeof row.summary === "object" ? (row.summary as Record<string, unknown>) : null,
        metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : null,
    };
}


// ---------------------------------------------------------------------------
// Write operations (called by ingest API)
// ---------------------------------------------------------------------------

export async function registerAgent(data: {
    name: string;
    description?: string | null;
    version?: string | null;
    metadata?: Record<string, unknown> | null;
}): Promise<void> {
    await prisma.agent.upsert({
        where: { name: data.name },
        update: {
            description: data.description ?? undefined,
            version: data.version ?? undefined,
            metadata: toJsonInput(data.metadata),
        },
        create: {
            name: data.name,
            description: data.description,
            version: data.version,
            metadata: toJsonInput(data.metadata),
        },
    });
}

export async function ensureSession(data: {
    id: string;
    name?: string | null;
    userId?: string | null;
    userData?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
}): Promise<void> {
    await prisma.session.upsert({
        where: { id: data.id },
        update: {
            name: data.name ?? undefined,
            userId: data.userId ?? undefined,
            userData: toJsonInput(data.userData),
            metadata: toJsonInput(data.metadata),
        },
        create: {
            id: data.id,
            name: data.name,
            userId: data.userId,
            userData: toJsonInput(data.userData),
            metadata: toJsonInput(data.metadata),
        },
    });
}

export async function updateSessionName(
    sessionId: string,
    name: string,
): Promise<void> {
    await prisma.session.update({
        where: { id: sessionId },
        data: { name },
    });
}

export async function updateSessionSummary(
    sessionId: string,
    summary: string,
): Promise<void> {
    await prisma.session.update({
        where: { id: sessionId },
        data: { summary },
    });
}

export async function ensureRun(data: {
    run_id: string;
    session_id?: string | null;
    task_name?: string | null;
    queue_name?: string | null;
    worker_name?: string | null;
    status?: string | null;
    input_preview?: unknown;
    metadata?: Record<string, unknown> | null;
    enqueued_at?: string | null;
}): Promise<void> {
    const enqueuedAt = data.enqueued_at ? new Date(data.enqueued_at) : undefined;

    await prisma.run.upsert({
        where: { id: data.run_id },
        update: {
            sessionId: data.session_id ?? undefined,
            taskName: data.task_name ?? undefined,
            queueName: data.queue_name ?? undefined,
            workerName: data.worker_name ?? undefined,
            status: data.status ?? undefined,
            inputPreview: toJsonInputOrNull(data.input_preview),
            metadata: toJsonInput(data.metadata),
            enqueuedAt,
            startedAt: new Date(),
        },
        create: {
            id: data.run_id,
            sessionId: data.session_id,
            taskName: data.task_name,
            queueName: data.queue_name,
            workerName: data.worker_name,
            status: data.status ?? "PENDING",
            inputPreview: toJsonInputOrNull(data.input_preview),
            metadata: toJsonInput(data.metadata),
            enqueuedAt,
            startedAt: new Date(),
        },
    });
}

export async function updateRun(
    runId: string,
    data: {
        status?: string | null;
        error?: string | null;
        worker_name?: string | null;
        output_preview?: unknown;
        latest_span_name?: string | null;
        latest_span_type?: string | null;
        latest_event?: string | null;
        root_span_id?: string | null;
        total_spans?: number | null;
        active_span_count?: number | null;
        summary?: Record<string, unknown> | null;
        metadata?: Record<string, unknown> | null;
        finished?: boolean;
    },
): Promise<void> {
    const update: Prisma.RunUpdateInput = {};
    if (data.status != null) update.status = data.status;
    if (data.error != null) update.error = data.error;
    if (data.worker_name != null) update.workerName = data.worker_name;
    if (data.output_preview !== undefined && data.output_preview !== null)
        update.outputPreview = data.output_preview as Prisma.InputJsonValue;
    if (data.latest_span_name != null)
        update.latestSpanName = data.latest_span_name;
    if (data.latest_span_type != null)
        update.latestSpanType = data.latest_span_type;
    if (data.latest_event != null) update.latestEvent = data.latest_event;
    if (data.root_span_id != null) update.rootSpanId = data.root_span_id;
    if (data.total_spans != null) update.totalSpans = data.total_spans;
    if (data.active_span_count != null)
        update.activeSpanCount = data.active_span_count;
    if (data.summary != null)
        update.summary = data.summary as Prisma.InputJsonValue;
    if (data.metadata != null)
        update.metadata = data.metadata as Prisma.InputJsonValue;
    if (data.finished) update.finishedAt = new Date();

    if (Object.keys(update).length > 0) {
        await prisma.run.upsert({
            where: { id: runId },
            update,
            create: {
                id: runId,
                status: data.status ?? "PENDING",
                startedAt: new Date(),
                ...(data.finished ? { finishedAt: new Date() } : {}),
            },
        });
    }
}

export async function startSpan(data: {
    span_id: string;
    run_id: string;
    name: string;
    run_type: string;
    parent_span_id?: string | null;
    agent_name?: string | null;
    input_preview?: unknown;
    metadata?: Record<string, unknown> | null;
    tags?: string[] | null;
}): Promise<void> {
    await prisma.span.create({
        data: {
            id: data.span_id,
            runId: data.run_id,
            name: data.name,
            runType: data.run_type,
            parentSpanId: data.parent_span_id,
            agentName: data.agent_name,
            status: "RUNNING",
            inputPreview: toJsonInputOrNull(data.input_preview),
            metadata: toJsonInput(data.metadata),
            tags: data.tags ?? [],
            startedAt: new Date(),
        },
    });
}

export async function finishSpan(
    spanId: string,
    data: {
        run_id?: string | null;
        status: string;
        name?: string | null;
        run_type?: string | null;
        output_preview?: unknown;
        error?: string | null;
        metadata?: Record<string, unknown> | null;
        tags?: string[] | null;
    },
): Promise<void> {
    const now = new Date();
    const update: Prisma.SpanUpdateInput = {
        status: data.status,
        finishedAt: now,
    };
    if (data.name != null) update.name = data.name;
    if (data.run_type != null) update.runType = data.run_type;
    if (data.output_preview !== undefined && data.output_preview !== null)
        update.outputPreview = data.output_preview as Prisma.InputJsonValue;
    if (data.error != null) update.error = data.error;
    if (data.metadata != null)
        update.metadata = data.metadata as Prisma.InputJsonValue;
    if (data.tags != null) update.tags = data.tags;

    await prisma.span.upsert({
        where: { id: spanId },
        update,
        create: {
            id: spanId,
            runId: data.run_id ?? "unknown",
            name: data.name ?? spanId,
            runType: data.run_type ?? "unknown",
            status: data.status,
            outputPreview: toJsonInputOrNull(data.output_preview),
            error: data.error,
            metadata: toJsonInput(data.metadata),
            tags: data.tags ?? [],
            finishedAt: now,
        },
    });
}

export async function getAgentRecentRuns(
    name: string,
    limit = 20,
): Promise<ObservedRunSummary[]> {
    const rows = await prisma.run.findMany({
        where: { taskName: name, isDeleted: false },
        orderBy: { updatedAt: "desc" },
        take: limit,
    });
    return rows.map(serializeRun);
}

// ---------------------------------------------------------------------------
// Write operations (called by ingest API)
// ---------------------------------------------------------------------------

export async function createEvents(
    events: Array<{
        span_id?: string | null;
        run_id: string;
        type: string;
        name?: string | null;
        message?: string | null;
        level?: string | null;
        data?: Record<string, unknown> | null;
        timestamp?: string | null;
    }>,
): Promise<void> {
    if (events.length === 0) return;
    await prisma.event.createMany({
        data: events.map((e) => ({
            spanId: e.span_id ?? undefined,
            runId: e.run_id,
            type: e.type,
            name: e.name ?? undefined,
            message: e.message ?? undefined,
            level: e.level ?? undefined,
            data: toJsonInput(e.data) as Prisma.InputJsonValue | undefined,
            timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
        })),
    });
}

// ---------------------------------------------------------------------------
// OTLP upsert helpers (called by /v1/traces)
// ---------------------------------------------------------------------------

export async function upsertSpanFromOTLP(data: {
    span_id: string;
    run_id: string;
    parent_span_id: string | null;
    name: string;
    run_type: string;
    agent_name: string | null;
    status: string;
    error: string | null;
    input_preview: unknown;
    output_preview: unknown;
    metadata: Record<string, unknown> | null;
    started_at: Date | null;
    finished_at: Date | null;
}): Promise<void> {
    const update: Prisma.SpanUpdateInput = {
        name: data.name,
        runType: data.run_type,
        status: data.status,
    };
    if (data.agent_name != null) update.agentName = data.agent_name;
    if (data.error != null) update.error = data.error;
    if (data.input_preview != null)
        update.inputPreview = data.input_preview as Prisma.InputJsonValue;
    if (data.output_preview != null)
        update.outputPreview = data.output_preview as Prisma.InputJsonValue;
    if (data.metadata != null)
        update.metadata = data.metadata as Prisma.InputJsonValue;
    if (data.started_at) update.startedAt = data.started_at;
    if (data.finished_at) update.finishedAt = data.finished_at;

    await prisma.span.upsert({
        where: { id: data.span_id },
        update,
        create: {
            id: data.span_id,
            runId: data.run_id,
            parentSpanId: data.parent_span_id,
            name: data.name,
            runType: data.run_type,
            agentName: data.agent_name,
            status: data.status,
            error: data.error,
            inputPreview: toJsonInputOrNull(data.input_preview),
            outputPreview: toJsonInputOrNull(data.output_preview),
            metadata: toJsonInput(data.metadata),
            tags: [],
            startedAt: data.started_at ?? new Date(),
            finishedAt: data.finished_at,
        },
    });
}

export async function upsertRunFromRootSpan(data: {
    run_id: string;
    session_id: string | null;
    task_name: string | null;
    queue_name: string | null;
    worker_name: string | null;
    status: string;
    error: string | null;
    input_preview: unknown;
    output_preview: unknown;
    root_span_id: string | null;
    started_at: Date | null;
    finished_at: Date | null;
    metadata: Record<string, unknown> | null;
}): Promise<void> {
    const update: Prisma.RunUpdateInput = {
        status: data.status,
    };
    if (data.session_id != null) update.sessionId = data.session_id;
    if (data.task_name != null) update.taskName = data.task_name;
    if (data.queue_name != null) update.queueName = data.queue_name;
    if (data.worker_name != null) update.workerName = data.worker_name;
    if (data.error != null) update.error = data.error;
    if (data.input_preview != null)
        update.inputPreview = data.input_preview as Prisma.InputJsonValue;
    if (data.output_preview != null)
        update.outputPreview = data.output_preview as Prisma.InputJsonValue;
    if (data.root_span_id != null) update.rootSpanId = data.root_span_id;
    if (data.started_at) update.startedAt = data.started_at;
    if (data.finished_at) update.finishedAt = data.finished_at;
    if (data.metadata != null)
        update.metadata = data.metadata as Prisma.InputJsonValue;

    await prisma.run.upsert({
        where: { id: data.run_id },
        update,
        create: {
            id: data.run_id,
            sessionId: data.session_id,
            taskName: data.task_name,
            queueName: data.queue_name,
            workerName: data.worker_name,
            status: data.status,
            error: data.error,
            inputPreview: toJsonInputOrNull(data.input_preview),
            outputPreview: toJsonInputOrNull(data.output_preview),
            rootSpanId: data.root_span_id,
            metadata: toJsonInput(data.metadata),
            startedAt: data.started_at ?? new Date(),
            finishedAt: data.finished_at,
        },
    });
}
