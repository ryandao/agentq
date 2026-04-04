import { prisma } from "@/src/lib/prisma";
import type {
    AgentDependencyEdge,
    AgentHourlyBucket,
    AgentRunStats,
} from "@/src/server/contracts";

export interface RunStatsRow {
    status: string;
    count: number;
}

export interface DurationStatsRow {
    task_name: string;
    avg_ms: number;
    p50_ms: number;
    p95_ms: number;
    count: number;
}

export interface TokenStatsRow {
    model: string;
    total_tokens: number;
    run_count: number;
}

export interface ErrorPatternRow {
    error_prefix: string;
    task_name: string | null;
    count: number;
}

export interface HourlyThroughputRow {
    hour: string;
    count: number;
    failure_count: number;
}

export interface QueueWaitStatsRow {
    task_name: string;
    avg_ms: number;
    p50_ms: number;
    p95_ms: number;
    count: number;
}

export interface QueueThroughputRow {
    queue_name: string;
    count: number;
    failure_count: number;
}

export interface WorkerThroughputRow {
    worker_name: string;
    count: number;
    failure_count: number;
}

export interface HourlyDimensionRow {
    hour: string;
    dimension: string;
    count: number;
}

export async function getRunStatsByTimeRange(
    from: Date,
    to: Date,
): Promise<RunStatsRow[]> {
    const rows = await prisma.$queryRaw<{ status: string; count: bigint }[]>`
        SELECT status, COUNT(*)::int AS count
        FROM runs
        WHERE is_deleted = false
          AND started_at >= ${from}
          AND started_at <= ${to}
        GROUP BY status
    `;
    return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
}

export async function getDurationStatsByAgent(
    from: Date,
    to: Date,
): Promise<DurationStatsRow[]> {
    const rows = await prisma.$queryRaw<
        { task_name: string; avg_ms: number; p50_ms: number; p95_ms: number; count: bigint }[]
    >`
        SELECT
            COALESCE(task_name, 'unknown') AS task_name,
            AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::double precision AS avg_ms,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::double precision AS p50_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::double precision AS p95_ms,
            COUNT(*)::int AS count
        FROM runs
        WHERE is_deleted = false
          AND started_at >= ${from}
          AND started_at <= ${to}
          AND finished_at IS NOT NULL
          AND started_at IS NOT NULL
        GROUP BY task_name
        ORDER BY count DESC
        LIMIT 20
    `;
    return rows.map((r) => ({
        task_name: r.task_name,
        avg_ms: Math.round(r.avg_ms ?? 0),
        p50_ms: Math.round(r.p50_ms ?? 0),
        p95_ms: Math.round(r.p95_ms ?? 0),
        count: Number(r.count),
    }));
}

export async function getQueueWaitStatsByAgent(
    from: Date,
    to: Date,
): Promise<QueueWaitStatsRow[]> {
    const rows = await prisma.$queryRaw<
        { task_name: string; avg_ms: number; p50_ms: number; p95_ms: number; count: bigint }[]
    >`
        SELECT
            COALESCE(task_name, 'unknown') AS task_name,
            AVG(EXTRACT(EPOCH FROM (started_at - enqueued_at)) * 1000)::double precision AS avg_ms,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (started_at - enqueued_at)) * 1000)::double precision AS p50_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (started_at - enqueued_at)) * 1000)::double precision AS p95_ms,
            COUNT(*)::int AS count
        FROM runs
        WHERE is_deleted = false
          AND started_at >= ${from}
          AND started_at <= ${to}
          AND enqueued_at IS NOT NULL
          AND started_at IS NOT NULL
        GROUP BY task_name
        ORDER BY count DESC
        LIMIT 20
    `;
    return rows.map((r) => ({
        task_name: r.task_name,
        avg_ms: Math.round(r.avg_ms ?? 0),
        p50_ms: Math.round(r.p50_ms ?? 0),
        p95_ms: Math.round(r.p95_ms ?? 0),
        count: Number(r.count),
    }));
}

export async function getTokenStatsByModel(
    from: Date,
    to: Date,
): Promise<TokenStatsRow[]> {
    const rows = await prisma.$queryRaw<
        { model: string; total_tokens: bigint; run_count: bigint }[]
    >`
        SELECT
            COALESCE(s.metadata->>'model', 'unknown') AS model,
            COALESCE(SUM((s.metadata->'usage'->>'total_tokens')::int), 0) AS total_tokens,
            COUNT(DISTINCT s.run_id) AS run_count
        FROM spans s
        JOIN runs r ON r.run_id = s.run_id
        WHERE s.run_type = 'llm'
          AND s.metadata->'usage'->>'total_tokens' IS NOT NULL
          AND r.is_deleted = false
          AND r.started_at >= ${from}
          AND r.started_at <= ${to}
        GROUP BY model
        ORDER BY total_tokens DESC
    `;
    return rows.map((r) => ({
        model: r.model,
        total_tokens: Number(r.total_tokens),
        run_count: Number(r.run_count),
    }));
}

export async function getErrorPatterns(
    from: Date,
    to: Date,
): Promise<ErrorPatternRow[]> {
    const rows = await prisma.$queryRaw<
        { error_prefix: string; task_name: string | null; count: bigint }[]
    >`
        SELECT
            LEFT(error, 120) AS error_prefix,
            task_name,
            COUNT(*)::int AS count
        FROM runs
        WHERE is_deleted = false
          AND status = 'FAILURE'
          AND error IS NOT NULL
          AND started_at >= ${from}
          AND started_at <= ${to}
        GROUP BY error_prefix, task_name
        ORDER BY count DESC
        LIMIT 15
    `;
    return rows.map((r) => ({
        error_prefix: r.error_prefix,
        task_name: r.task_name,
        count: Number(r.count),
    }));
}

export async function getHourlyThroughput(
    from: Date,
    to: Date,
): Promise<HourlyThroughputRow[]> {
    const rows = await prisma.$queryRaw<
        { hour: Date; count: bigint; failure_count: bigint }[]
    >`
        SELECT
            date_trunc('hour', started_at) AS hour,
            COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE status = 'FAILURE')::int AS failure_count
        FROM runs
        WHERE is_deleted = false
          AND started_at >= ${from}
          AND started_at <= ${to}
          AND started_at IS NOT NULL
        GROUP BY hour
        ORDER BY hour ASC
    `;
    return rows.map((r) => ({
        hour: r.hour instanceof Date ? r.hour.toISOString() : String(r.hour),
        count: Number(r.count),
        failure_count: Number(r.failure_count),
    }));
}

export async function getQueueThroughput(
    from: Date,
    to: Date,
): Promise<QueueThroughputRow[]> {
    const rows = await prisma.$queryRaw<
        { queue_name: string; count: bigint; failure_count: bigint }[]
    >`
        SELECT
            COALESCE(queue_name, 'default') AS queue_name,
            COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE status = 'FAILURE')::int AS failure_count
        FROM runs
        WHERE is_deleted = false
          AND started_at >= ${from}
          AND started_at <= ${to}
          AND started_at IS NOT NULL
        GROUP BY queue_name
        ORDER BY count DESC
    `;
    return rows.map((r) => ({
        queue_name: r.queue_name,
        count: Number(r.count),
        failure_count: Number(r.failure_count),
    }));
}

export async function getWorkerThroughput(
    from: Date,
    to: Date,
): Promise<WorkerThroughputRow[]> {
    const rows = await prisma.$queryRaw<
        { worker_name: string; count: bigint; failure_count: bigint }[]
    >`
        SELECT
            COALESCE(worker_name, 'unknown') AS worker_name,
            COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE status = 'FAILURE')::int AS failure_count
        FROM runs
        WHERE is_deleted = false
          AND started_at >= ${from}
          AND started_at <= ${to}
          AND started_at IS NOT NULL
        GROUP BY worker_name
        ORDER BY count DESC
    `;
    return rows.map((r) => ({
        worker_name: r.worker_name,
        count: Number(r.count),
        failure_count: Number(r.failure_count),
    }));
}

export async function getHourlyWorkerThroughput(
    from: Date,
    to: Date,
): Promise<HourlyDimensionRow[]> {
    const rows = await prisma.$queryRaw<
        { hour: Date; dimension: string; count: bigint }[]
    >`
        SELECT
            date_trunc('hour', started_at) AS hour,
            COALESCE(worker_name, 'unknown') AS dimension,
            COUNT(*)::int AS count
        FROM runs
        WHERE is_deleted = false
          AND started_at >= ${from}
          AND started_at <= ${to}
          AND started_at IS NOT NULL
        GROUP BY hour, dimension
        ORDER BY hour ASC
    `;
    return rows.map((r) => ({
        hour: r.hour instanceof Date ? r.hour.toISOString() : String(r.hour),
        dimension: r.dimension,
        count: Number(r.count),
    }));
}

export async function getHourlyQueueThroughput(
    from: Date,
    to: Date,
): Promise<HourlyDimensionRow[]> {
    const rows = await prisma.$queryRaw<
        { hour: Date; dimension: string; count: bigint }[]
    >`
        SELECT
            date_trunc('hour', started_at) AS hour,
            COALESCE(queue_name, 'default') AS dimension,
            COUNT(*)::int AS count
        FROM runs
        WHERE is_deleted = false
          AND started_at >= ${from}
          AND started_at <= ${to}
          AND started_at IS NOT NULL
        GROUP BY hour, dimension
        ORDER BY hour ASC
    `;
    return rows.map((r) => ({
        hour: r.hour instanceof Date ? r.hour.toISOString() : String(r.hour),
        dimension: r.dimension,
        count: Number(r.count),
    }));
}

// ---------------------------------------------------------------------------
// Agent-specific analytics
// ---------------------------------------------------------------------------

export async function getAgentRunStats(
    from: Date,
    to: Date,
): Promise<AgentRunStats[]> {
    const rows = await prisma.$queryRaw<
        {
            agent_name: string;
            total_runs: bigint;
            success_count: bigint;
            failure_count: bigint;
            avg_duration_ms: number | null;
            total_tokens: bigint;
        }[]
    >`
        SELECT
            COALESCE(r.task_name, 'unknown') AS agent_name,
            COUNT(*)::int AS total_runs,
            COUNT(*) FILTER (WHERE r.status = 'SUCCESS')::int AS success_count,
            COUNT(*) FILTER (WHERE r.status = 'FAILURE')::int AS failure_count,
            AVG(EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) * 1000)::double precision AS avg_duration_ms,
            COALESCE(SUM(token_sub.total_tokens), 0)::int AS total_tokens
        FROM runs r
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM((s.metadata->'usage'->>'total_tokens')::int), 0) AS total_tokens
            FROM spans s
            WHERE s.run_id = r.run_id AND s.run_type = 'llm'
              AND s.metadata->'usage'->>'total_tokens' IS NOT NULL
        ) token_sub ON true
        WHERE r.is_deleted = false
          AND r.started_at >= ${from}
          AND r.started_at <= ${to}
        GROUP BY r.task_name
        ORDER BY total_runs DESC
    `;
    return rows.map((r) => ({
        agent_name: r.agent_name,
        total_runs: Number(r.total_runs),
        success_count: Number(r.success_count),
        failure_count: Number(r.failure_count),
        avg_duration_ms: r.avg_duration_ms != null ? Math.round(r.avg_duration_ms) : null,
        total_tokens: Number(r.total_tokens),
    }));
}

export async function getAgentErrorPatterns(
    name: string,
    from: Date,
    to: Date,
): Promise<{ error_prefix: string; count: number }[]> {
    const rows = await prisma.$queryRaw<
        { error_prefix: string; count: bigint }[]
    >`
        SELECT
            LEFT(error, 120) AS error_prefix,
            COUNT(*)::int AS count
        FROM runs
        WHERE is_deleted = false
          AND status = 'FAILURE'
          AND error IS NOT NULL
          AND task_name = ${name}
          AND started_at >= ${from}
          AND started_at <= ${to}
        GROUP BY error_prefix
        ORDER BY count DESC
        LIMIT 10
    `;
    return rows.map((r) => ({
        error_prefix: r.error_prefix,
        count: Number(r.count),
    }));
}

export async function getAgentDurationStats(
    name: string,
    from: Date,
    to: Date,
): Promise<{ avg_ms: number; p50_ms: number; p95_ms: number } | null> {
    const rows = await prisma.$queryRaw<
        { avg_ms: number; p50_ms: number; p95_ms: number; cnt: bigint }[]
    >`
        SELECT
            AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::double precision AS avg_ms,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::double precision AS p50_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::double precision AS p95_ms,
            COUNT(*)::int AS cnt
        FROM runs
        WHERE is_deleted = false
          AND task_name = ${name}
          AND started_at >= ${from}
          AND started_at <= ${to}
          AND finished_at IS NOT NULL
          AND started_at IS NOT NULL
    `;
    const row = rows[0];
    if (!row || Number(row.cnt) === 0) return null;
    return {
        avg_ms: Math.round(row.avg_ms ?? 0),
        p50_ms: Math.round(row.p50_ms ?? 0),
        p95_ms: Math.round(row.p95_ms ?? 0),
    };
}

export async function getAgentTokenStatsByModel(
    name: string,
    from: Date,
    to: Date,
): Promise<{ total_tokens: number; by_model: Record<string, number> }> {
    const rows = await prisma.$queryRaw<
        { model: string; total_tokens: bigint }[]
    >`
        SELECT
            COALESCE(s.metadata->>'model', 'unknown') AS model,
            COALESCE(SUM((s.metadata->'usage'->>'total_tokens')::int), 0) AS total_tokens
        FROM spans s
        JOIN runs r ON r.run_id = s.run_id
        WHERE s.run_type = 'llm'
          AND s.metadata->'usage'->>'total_tokens' IS NOT NULL
          AND r.is_deleted = false
          AND r.task_name = ${name}
          AND r.started_at >= ${from}
          AND r.started_at <= ${to}
        GROUP BY model
        ORDER BY total_tokens DESC
    `;
    let total = 0;
    const byModel: Record<string, number> = {};
    for (const r of rows) {
        const n = Number(r.total_tokens);
        total += n;
        byModel[r.model] = n;
    }
    return { total_tokens: total, by_model: byModel };
}

export async function getAgentRunStatusCounts(
    name: string,
    from: Date,
    to: Date,
): Promise<{ total: number; success: number; failure: number; running: number; pending: number }> {
    const rows = await prisma.$queryRaw<
        { status: string; count: bigint }[]
    >`
        SELECT status, COUNT(*)::int AS count
        FROM runs
        WHERE is_deleted = false
          AND task_name = ${name}
          AND started_at >= ${from}
          AND started_at <= ${to}
        GROUP BY status
    `;
    const counts = { total: 0, success: 0, failure: 0, running: 0, pending: 0 };
    for (const r of rows) {
        const n = Number(r.count);
        counts.total += n;
        if (r.status === "SUCCESS") counts.success = n;
        else if (r.status === "FAILURE") counts.failure = n;
        else if (r.status === "RUNNING") counts.running = n;
        else if (r.status === "PENDING") counts.pending = n;
    }
    return counts;
}

export async function getAgentHourlyStats(
    name: string,
    from: Date,
    to: Date,
): Promise<AgentHourlyBucket[]> {
    const rows = await prisma.$queryRaw<
        {
            hour: Date;
            success_count: bigint;
            failure_count: bigint;
            total_tokens: bigint;
            avg_duration_ms: number | null;
        }[]
    >`
        SELECT
            date_trunc('hour', r.started_at) AS hour,
            COUNT(*) FILTER (WHERE r.status = 'SUCCESS')::int AS success_count,
            COUNT(*) FILTER (WHERE r.status = 'FAILURE')::int AS failure_count,
            COALESCE(SUM(token_sub.total_tokens), 0)::int AS total_tokens,
            AVG(EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) * 1000)
                FILTER (WHERE r.finished_at IS NOT NULL)::double precision AS avg_duration_ms
        FROM runs r
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM((s.metadata->'usage'->>'total_tokens')::int), 0) AS total_tokens
            FROM spans s
            WHERE s.run_id = r.run_id AND s.run_type = 'llm'
              AND s.metadata->'usage'->>'total_tokens' IS NOT NULL
        ) token_sub ON true
        WHERE r.is_deleted = false
          AND r.task_name = ${name}
          AND r.started_at >= ${from}
          AND r.started_at <= ${to}
          AND r.started_at IS NOT NULL
        GROUP BY hour
        ORDER BY hour ASC
    `;
    return rows.map((r) => ({
        hour: r.hour instanceof Date ? r.hour.toISOString() : String(r.hour),
        success_count: Number(r.success_count),
        failure_count: Number(r.failure_count),
        total_tokens: Number(r.total_tokens),
        avg_duration_ms: r.avg_duration_ms != null ? Math.round(r.avg_duration_ms) : null,
    }));
}

export async function getAgentDependencyGraph(
    from: Date,
    to: Date,
): Promise<AgentDependencyEdge[]> {
    const rows = await prisma.$queryRaw<
        { source: string; target: string; target_type: string; call_count: bigint }[]
    >`
        WITH RECURSIVE agent_ancestor AS (
            -- For each agent span, walk up the tree to find nearest ancestor
            -- with a different agent_name (skipping NULLs and same-agent spans).
            SELECT
                s.span_id AS origin_id,
                s.agent_name AS origin_agent,
                s.parent_span_id AS cursor_id,
                0 AS depth
            FROM spans s
            JOIN runs r ON s.run_id = r.run_id
            WHERE s.run_type = 'agent'
              AND s.agent_name IS NOT NULL
              AND s.parent_span_id IS NOT NULL
              AND r.is_deleted = false
              AND r.started_at >= ${from}
              AND r.started_at <= ${to}

            UNION ALL

            SELECT
                aa.origin_id,
                aa.origin_agent,
                p.parent_span_id,
                aa.depth + 1
            FROM agent_ancestor aa
            JOIN spans p ON aa.cursor_id = p.span_id
            WHERE (p.agent_name IS NULL OR p.agent_name = aa.origin_agent)
              AND p.parent_span_id IS NOT NULL
              AND aa.depth < 30
        )
        SELECT source, target, target_type, SUM(call_count)::int AS call_count
        FROM (
            SELECT
                anc.agent_name AS source,
                aa.origin_agent AS target,
                'agent' AS target_type,
                COUNT(*)::int AS call_count
            FROM agent_ancestor aa
            JOIN spans anc ON aa.cursor_id = anc.span_id
            WHERE anc.agent_name IS NOT NULL
              AND anc.agent_name != aa.origin_agent
            GROUP BY anc.agent_name, aa.origin_agent

            UNION ALL

            SELECT
                COALESCE(child_s.agent_name, parent_s.agent_name) AS source,
                child_s.name AS target,
                'tool' AS target_type,
                COUNT(*)::int AS call_count
            FROM spans child_s
            LEFT JOIN spans parent_s ON child_s.parent_span_id = parent_s.span_id
            JOIN runs r ON child_s.run_id = r.run_id
            WHERE child_s.run_type = 'tool'
              AND COALESCE(child_s.agent_name, parent_s.agent_name) IS NOT NULL
              AND r.is_deleted = false
              AND r.started_at >= ${from}
              AND r.started_at <= ${to}
            GROUP BY COALESCE(child_s.agent_name, parent_s.agent_name), child_s.name

            UNION ALL

            SELECT
                COALESCE(child_s.agent_name, parent_s.agent_name) AS source,
                COALESCE(child_s.metadata->>'model', child_s.name) AS target,
                'llm' AS target_type,
                COUNT(*)::int AS call_count
            FROM spans child_s
            LEFT JOIN spans parent_s ON child_s.parent_span_id = parent_s.span_id
            JOIN runs r ON child_s.run_id = r.run_id
            WHERE child_s.run_type = 'llm'
              AND COALESCE(child_s.agent_name, parent_s.agent_name) IS NOT NULL
              AND r.is_deleted = false
              AND r.started_at >= ${from}
              AND r.started_at <= ${to}
            GROUP BY COALESCE(child_s.agent_name, parent_s.agent_name), COALESCE(child_s.metadata->>'model', child_s.name)
        ) sub
        GROUP BY source, target, target_type
        ORDER BY call_count DESC
    `;
    return rows.map((r) => ({
        source: r.source,
        target: r.target,
        target_type: r.target_type as "agent" | "tool" | "llm",
        call_count: Number(r.call_count),
    }));
}
