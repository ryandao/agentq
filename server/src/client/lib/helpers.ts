import type { ObservedSpan, ObservedRunSummary, AgentRunStats } from "@/src/client/api";
import type { SpanTreeNode, SessionGroup } from "./types";

export function getStatusVariant(status?: string | null) {
    if (status === "SUCCESS") return "success" as const;
    if (status === "FAILURE" || status === "ABORTED") return "error" as const;
    if (status === "RUNNING" || status === "PENDING") return "warning" as const;
    return "neutral" as const;
}

export function sortByNewestDate<T>(
    items: T[],
    getTimestamp: (item: T) => string | null,
) {
    return [...items].sort((left, right) => {
        const leftValue = getTimestamp(left);
        const rightValue = getTimestamp(right);
        const leftTime = leftValue ? new Date(leftValue).getTime() : 0;
        const rightTime = rightValue ? new Date(rightValue).getTime() : 0;
        return rightTime - leftTime;
    });
}

export function buildSpanTree(spans: ObservedSpan[]): SpanTreeNode[] {
    const byId = new Map<string, SpanTreeNode>();
    const roots: SpanTreeNode[] = [];
    spans.forEach((span) => {
        byId.set(span.span_id, { ...span, children: [] });
    });
    byId.forEach((span) => {
        if (span.parent_span_id && byId.has(span.parent_span_id)) {
            byId.get(span.parent_span_id)?.children.push(span);
        } else {
            roots.push(span);
        }
    });
    return roots;
}

export function buildSessionGroups(runs: ObservedRunSummary[]): SessionGroup[] {
    const sessions = new Map<string, SessionGroup>();
    runs.forEach((run) => {
        const sessionId = run.session_id?.trim() || "__no_session__";
        const latestTimestamp =
            run.updated_at || run.finished_at || run.started_at || run.created_at || null;
        const current = sessions.get(sessionId);
        if (!current) {
            sessions.set(sessionId, {
                sessionId,
                displaySessionId:
                    sessionId === "__no_session__" ? "No session" : sessionId,
                runs: [run],
                totalSpans: run.total_spans,
                activeRuns:
                    run.status === "RUNNING" || run.status === "PENDING" ? 1 : 0,
                latestTimestamp,
            });
            return;
        }
        current.runs.push(run);
        current.totalSpans += run.total_spans;
        if (run.status === "RUNNING" || run.status === "PENDING") {
            current.activeRuns += 1;
        }
        const currentLatest = current.latestTimestamp
            ? new Date(current.latestTimestamp).getTime()
            : 0;
        const nextLatest = latestTimestamp
            ? new Date(latestTimestamp).getTime()
            : 0;
        if (nextLatest > currentLatest) {
            current.latestTimestamp = latestTimestamp;
        }
    });

    return sortByNewestDate(
        Array.from(sessions.values()).map((session) => ({
            ...session,
            runs: sortByNewestDate(
                session.runs,
                (run) =>
                    run.updated_at ||
                    run.finished_at ||
                    run.started_at ||
                    run.created_at ||
                    null,
            ),
        })),
        (session) => session.latestTimestamp,
    );
}

export function getHealthBadge(stats: AgentRunStats | undefined) {
    if (!stats || stats.total_runs === 0) return { variant: "neutral" as const, label: "No runs" };
    const failRate = stats.failure_count / stats.total_runs;
    if (failRate > 0.2) return { variant: "error" as const, label: "Unhealthy" };
    if (failRate > 0.05) return { variant: "warning" as const, label: "Degraded" };
    return { variant: "success" as const, label: "Healthy" };
}
