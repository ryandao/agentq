import type {
    InfraSuggestion,
    InfraSuggestionCategory,
    InfraSuggestionSeverity,
    InfraSuggestionsResponse,
    ObservabilityQueueSnapshot,
} from "./contracts";
import { getQueueSnapshot } from "./queue";
import {
    type HourlyThroughputRow,
    type QueueThroughputRow,
    type RunStatsRow,
    getHourlyThroughput,
    getQueueThroughput,
    getRunStatsByTimeRange,
} from "./analytics";

// ---------------------------------------------------------------------------
// SuggestionRule + SuggestionContext
// ---------------------------------------------------------------------------

interface SuggestionContext {
    live: ObservabilityQueueSnapshot;
    hourlyThroughput: HourlyThroughputRow[];
    recentRunStats: RunStatsRow[];
    fullRunStats: RunStatsRow[];
    queueThroughput: QueueThroughputRow[];
    lookbackHours: number;
}

interface SuggestionRule {
    id: string;
    category: InfraSuggestionCategory;
    enabled: boolean;
    evaluate: (ctx: SuggestionContext) => InfraSuggestion | InfraSuggestion[] | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function failureRate(stats: RunStatsRow[]): number {
    const total = stats.reduce((sum, r) => sum + r.count, 0);
    if (total === 0) return 0;
    const failures = stats.filter((r) => r.status === "FAILURE").reduce((sum, r) => sum + r.count, 0);
    return (failures / total) * 100;
}

function avgHourlyThroughput(rows: HourlyThroughputRow[]): number {
    if (rows.length === 0) return 0;
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    return total / rows.length;
}

function stdDevThroughput(rows: HourlyThroughputRow[], avg: number): number {
    if (rows.length < 2) return 0;
    const variance = rows.reduce((sum, r) => sum + (r.count - avg) ** 2, 0) / rows.length;
    return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const RULES: SuggestionRule[] = [
    // ── Capacity ─────────────────────────────────────────────────────────

    {
        id: "capacity.immediate-scale-up",
        category: "capacity",
        enabled: true,
        evaluate(ctx) {
            const { workers, pending_tasks } = ctx.live.counts;
            if (workers === 0 || pending_tasks <= workers) return null;
            const ratio = Math.round(pending_tasks / workers);
            return {
                severity: ratio > 10 ? "critical" : "warning",
                category: "capacity",
                title: "Pending tasks exceed worker count",
                detail: `${pending_tasks} pending tasks for ${workers} worker(s) (${ratio}:1 ratio). Tasks are queueing faster than they can be consumed.`,
                action: "Scale up workers or increase concurrency immediately to prevent further backlog.",
                metric_context: {
                    label: "Pending-to-Worker Ratio",
                    current: ratio,
                    historical_avg: 0,
                    unit: ":1",
                },
            };
        },
    },
    {
        id: "capacity.chronic-over-utilization",
        category: "capacity",
        enabled: true,
        evaluate(ctx) {
            const { workers, active_tasks } = ctx.live.counts;
            if (workers === 0 || ctx.hourlyThroughput.length < 3) return null;

            const avgThroughput = avgHourlyThroughput(ctx.hourlyThroughput);
            const currentUtil = (active_tasks / workers) * 100;

            if (avgThroughput > workers && currentUtil > 70) {
                return {
                    severity: "warning",
                    category: "capacity",
                    title: "Chronically over-utilized workers",
                    detail: `Average throughput over the last ${ctx.lookbackHours}h is ${avgThroughput.toFixed(1)} tasks/hr with only ${workers} worker(s). Current utilization is ${currentUtil.toFixed(0)}%.`,
                    action: "Add more workers to handle the sustained load. Consider auto-scaling based on queue depth.",
                    metric_context: {
                        label: "Avg Throughput vs Workers",
                        current: Math.round(avgThroughput),
                        historical_avg: workers,
                        unit: "tasks/hr",
                    },
                };
            }
            return null;
        },
    },
    {
        id: "capacity.chronic-under-utilization",
        category: "capacity",
        enabled: true,
        evaluate(ctx) {
            const { workers, active_tasks, pending_tasks } = ctx.live.counts;
            if (workers <= 2 || ctx.hourlyThroughput.length < 3) return null;

            const avgThroughput = avgHourlyThroughput(ctx.hourlyThroughput);
            const isIdle = active_tasks === 0 && pending_tasks === 0;

            if (avgThroughput < workers * 0.2 && isIdle) {
                return {
                    severity: "info",
                    category: "capacity",
                    title: "Workers are chronically under-utilized",
                    detail: `Average throughput over ${ctx.lookbackHours}h is only ${avgThroughput.toFixed(1)} tasks/hr across ${workers} worker(s), and all workers are currently idle.`,
                    action: "Consider scaling down to reduce resource costs. A minimum of 1-2 workers is sufficient for this load.",
                    metric_context: {
                        label: "Avg Throughput",
                        current: Math.round(avgThroughput),
                        historical_avg: workers,
                        unit: "tasks/hr",
                    },
                };
            }
            return null;
        },
    },
    {
        id: "capacity.traffic-spike",
        category: "capacity",
        enabled: true,
        evaluate(ctx) {
            if (ctx.hourlyThroughput.length < 4) return null;

            const recentSlice = ctx.hourlyThroughput.slice(-2);
            const baselineSlice = ctx.hourlyThroughput.slice(0, -2);
            if (baselineSlice.length < 2) return null;

            const baselineAvg = avgHourlyThroughput(baselineSlice);
            if (baselineAvg === 0) return null;

            const recentAvg = avgHourlyThroughput(recentSlice);
            const spikeRatio = recentAvg / baselineAvg;

            const results: InfraSuggestion[] = [];

            if (spikeRatio > 1.5) {
                results.push({
                    severity: spikeRatio > 3 ? "critical" : "warning",
                    category: "capacity",
                    title: "Traffic spike detected",
                    detail: `Recent throughput (${recentAvg.toFixed(1)} tasks/hr) is ${spikeRatio.toFixed(1)}x the baseline average (${baselineAvg.toFixed(1)} tasks/hr, excluding the last 2h).`,
                    action: "Enable auto-scaling or temporarily add workers to handle the spike. Monitor if the trend sustains.",
                    metric_context: {
                        label: "Throughput",
                        current: Math.round(recentAvg),
                        historical_avg: Math.round(baselineAvg),
                        unit: "tasks/hr",
                    },
                });
            }

            const fullAvg = avgHourlyThroughput(ctx.hourlyThroughput);
            if (fullAvg > 0) {
                const stdDev = stdDevThroughput(ctx.hourlyThroughput, fullAvg);
                const cv = stdDev / fullAvg;
                if (cv > 1.0 && ctx.hourlyThroughput.length >= 6) {
                    results.push({
                        severity: "warning",
                        category: "capacity",
                        title: "Traffic is highly irregular (spiky pattern)",
                        detail: `Coefficient of variation is ${cv.toFixed(2)} over the past ${ctx.lookbackHours}h (mean ${fullAvg.toFixed(1)}, std dev ${stdDev.toFixed(1)} tasks/hr). Burst-then-idle pattern detected.`,
                        action: "Consider auto-scaling policies that react to queue depth rather than static worker counts.",
                    });
                }
            }

            return results.length > 0 ? results : null;
        },
    },
    {
        id: "capacity.unsubscribed-queue",
        category: "capacity",
        enabled: true,
        evaluate(ctx) {
            const results: InfraSuggestion[] = [];
            for (const q of ctx.live.broker_queues) {
                if (q.pending_count === 0) continue;
                const hasWorker = ctx.live.workers.some((w) => w.queues.includes(q.name));
                if (!hasWorker) {
                    results.push({
                        severity: "critical",
                        category: "capacity",
                        title: `No workers subscribed to "${q.name}"`,
                        detail: `Queue "${q.name}" has ${q.pending_count} pending task(s) but no workers are consuming from it. These tasks will never be processed.`,
                        action: `Start a worker targeting this queue (e.g. --queues=${q.name}).`,
                    });
                }
            }
            return results.length > 0 ? results : null;
        },
    },
    {
        id: "capacity.queue-backlog",
        category: "capacity",
        enabled: true,
        evaluate(ctx) {
            if (ctx.queueThroughput.length === 0) return null;
            const results: InfraSuggestion[] = [];

            for (const q of ctx.live.broker_queues) {
                if (q.pending_count < 10) continue;
                const histRow = ctx.queueThroughput.find((r) => r.queue_name === q.name);
                const historicalPerHour = histRow ? histRow.count / Math.max(ctx.lookbackHours, 1) : 0;
                const drainHours = historicalPerHour > 0 ? q.pending_count / historicalPerHour : Infinity;

                if (drainHours > 2) {
                    results.push({
                        severity: drainHours > 8 ? "critical" : "warning",
                        category: "capacity",
                        title: `Queue "${q.name}" backlog will take ${drainHours === Infinity ? "forever" : `~${Math.round(drainHours)}h`} to drain`,
                        detail: `${q.pending_count} pending tasks with historical throughput of ${historicalPerHour.toFixed(1)} tasks/hr on this queue.`,
                        action: `Add more workers targeting "${q.name}" to accelerate processing.`,
                        metric_context: {
                            label: "Estimated Drain Time",
                            current: q.pending_count,
                            historical_avg: Math.round(historicalPerHour),
                            unit: "tasks/hr throughput",
                        },
                    });
                }
            }
            return results.length > 0 ? results : null;
        },
    },

    // ── Reliability ──────────────────────────────────────────────────────

    {
        id: "reliability.rising-failure-rate",
        category: "reliability",
        enabled: true,
        evaluate(ctx) {
            const fullRate = failureRate(ctx.fullRunStats);
            const recentRate = failureRate(ctx.recentRunStats);
            const recentTotal = ctx.recentRunStats.reduce((s, r) => s + r.count, 0);

            if (recentTotal < 5) return null;
            if (fullRate === 0 && recentRate === 0) return null;

            if (recentRate > 15 || (fullRate > 0 && recentRate > fullRate * 1.5)) {
                return {
                    severity: recentRate > 25 ? "critical" : "warning",
                    category: "reliability",
                    title: "Failure rate is rising",
                    detail: `Recent failure rate (last 2h) is ${recentRate.toFixed(1)}% vs ${fullRate.toFixed(1)}% over the past ${ctx.lookbackHours}h.`,
                    action: "Investigate recent failures. Check error logs for new error patterns or infrastructure issues.",
                    metric_context: {
                        label: "Failure Rate",
                        current: Math.round(recentRate * 10) / 10,
                        historical_avg: Math.round(fullRate * 10) / 10,
                        unit: "%",
                    },
                };
            }
            return null;
        },
    },

    // ── Operational ──────────────────────────────────────────────────────

    {
        id: "operational.no-workers",
        category: "operational",
        enabled: true,
        evaluate(ctx) {
            if (ctx.live.counts.workers > 0) return null;
            return {
                severity: "critical",
                category: "operational",
                title: "No workers online",
                detail: "The broker reports zero active workers. No tasks can be processed until workers are started.",
                action: "Start workers targeting your configured queues.",
            };
        },
    },
    {
        id: "operational.broker-errors",
        category: "operational",
        enabled: true,
        evaluate(ctx) {
            if (ctx.live.errors.length === 0) return null;
            return {
                severity: "warning",
                category: "operational",
                title: "Broker inspection errors",
                detail: `${ctx.live.errors.length} error(s) during broker inspection: ${ctx.live.errors[0]}`,
                action: "Check broker connectivity and configuration. Ensure Redis/message broker is healthy.",
            };
        },
    },
];

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

async function buildContext(lookbackHours: number): Promise<SuggestionContext> {
    const now = new Date();
    const from = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
    const recentFrom = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const [
        live,
        hourlyThroughput,
        fullRunStats,
        recentRunStats,
        queueThroughput,
    ] = await Promise.all([
        getQueueSnapshot(),
        getHourlyThroughput(from, now),
        getRunStatsByTimeRange(from, now),
        getRunStatsByTimeRange(recentFrom, now),
        getQueueThroughput(from, now),
    ]);

    return {
        live,
        hourlyThroughput,
        fullRunStats,
        recentRunStats,
        queueThroughput,
        lookbackHours,
    };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<InfraSuggestionSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    success: 3,
};

function evaluateAllRules(ctx: SuggestionContext): InfraSuggestion[] {
    const suggestions: InfraSuggestion[] = [];

    for (const rule of RULES) {
        if (!rule.enabled) continue;

        try {
            const result = rule.evaluate(ctx);
            if (result === null) continue;
            if (Array.isArray(result)) {
                suggestions.push(...result);
            } else {
                suggestions.push(result);
            }
        } catch (err) {
            console.error(`[suggestions] Rule ${rule.id} threw:`, err);
        }
    }

    if (suggestions.length === 0 && ctx.live.counts.workers > 0) {
        const { workers, active_tasks, pending_tasks } = ctx.live.counts;
        suggestions.push({
            severity: "success",
            category: "operational",
            title: "System looks healthy",
            detail: `${workers} worker(s), ${active_tasks} active task(s), ${pending_tasks} pending. No issues detected over the last ${ctx.lookbackHours}h.`,
            action: "No action needed. Continue monitoring.",
        });
    }

    suggestions.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    return suggestions;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateInfraSuggestions(
    lookbackHours = 24,
): Promise<InfraSuggestionsResponse> {
    const ctx = await buildContext(lookbackHours);
    const suggestions = evaluateAllRules(ctx);

    return {
        generated_at: new Date().toISOString(),
        lookback_hours: lookbackHours,
        suggestions,
    };
}
