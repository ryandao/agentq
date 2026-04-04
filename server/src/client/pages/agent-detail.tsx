"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
    FeatherAlertCircle,
    FeatherCheck,
    FeatherChevronLeft,
    FeatherClock,
    FeatherLoader,
    FeatherPlay,
    FeatherZap,
} from "@subframe/core";
import { Badge } from "@/src/ui/components/Badge";
import { AreaChart } from "@/src/ui/components/AreaChart";
import type { AgentRunStats } from "@/src/client/api";
import { useAgentDetail } from "@/src/client/lib/hooks";
import { compactNumber, durationLabel, formatDurationMs, relativeTime } from "@/src/client/lib/format";
import { getStatusVariant, getHealthBadge } from "@/src/client/lib/helpers";
import { EmptyState, StatCard, SectionCard } from "@/src/client/components/shared";

export function AgentDetailPageView({ agentName }: { agentName: string }) {
    const { detail, loading } = useAgentDetail(agentName);


    const hourlyBuckets = useMemo(() => detail?.hourly ?? [], [detail?.hourly]);

    const runsChartData = useMemo(() =>
        hourlyBuckets.map((b) => ({
            time: new Date(b.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            Success: b.success_count,
            Failure: b.failure_count,
        })),
    [hourlyBuckets]);

    const tokensChartData = useMemo(() =>
        hourlyBuckets.map((b) => ({
            time: new Date(b.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            Tokens: b.total_tokens,
        })),
    [hourlyBuckets]);

    const latencyChartData = useMemo(() =>
        hourlyBuckets
            .filter((b) => b.avg_duration_ms != null)
            .map((b) => ({
                time: new Date(b.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                "Avg (ms)": b.avg_duration_ms!,
            })),
    [hourlyBuckets]);

    if (loading) {
        return (
            <div className="flex w-full items-center justify-center py-24">
                <FeatherLoader className="animate-spin text-neutral-400" />
            </div>
        );
    }

    if (!detail) {
        return (
            <div className="flex w-full flex-col gap-4">
                <Link href="/agents" className="flex items-center gap-1 text-body font-body text-brand-600 hover:text-brand-700">
                    <FeatherChevronLeft className="h-4 w-4" /> Back to Agents
                </Link>
                <EmptyState title="Agent not found" description={`No agent named "${agentName}" was found.`} />
            </div>
        );
    }

    const { agent, run_stats: rs, duration_stats: ds, token_stats: ts, recent_runs: runs, error_patterns: errors, dependency_graph: depGraph } = detail;
    const health = getHealthBadge(
        rs.total > 0
            ? { agent_name: agent.name, total_runs: rs.total, success_count: rs.success, failure_count: rs.failure, avg_duration_ms: ds?.avg_ms ?? null, total_tokens: ts.total_tokens }
            : undefined,
    );
    const successRate = rs.total > 0 ? ((rs.success / rs.total) * 100).toFixed(1) : "-";

    return (
        <div className="flex w-full flex-col gap-6">
            <div className="flex w-full flex-col gap-2">
                <Link href="/agents" className="flex items-center gap-1 text-body font-body text-brand-600 hover:text-brand-700">
                    <FeatherChevronLeft className="h-4 w-4" /> Back to Agents
                </Link>
                <div className="flex items-center gap-3">
                    <span className="text-heading-2 font-heading-2 text-default-font">{agent.name}</span>
                    {agent.version ? <Badge variant="neutral">v{agent.version}</Badge> : null}
                    <Badge variant={health.variant}>{health.label}</Badge>
                </div>
                {agent.description ? (
                    <span className="text-body font-body text-subtext-color">{agent.description}</span>
                ) : null}
            </div>

            <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-4">
                <StatCard
                    label="Total Runs"
                    value={
                        <span>
                            {compactNumber(rs.total)}
                            {rs.failure > 0 ? <span className="ml-2 text-body font-body text-error-600">{rs.failure} failed</span> : null}
                        </span>
                    }
                    icon={<FeatherPlay />}
                />
                <StatCard
                    label="Success Rate"
                    value={successRate === "-" ? "-" : `${successRate}%`}
                    icon={<FeatherCheck />}
                    variant={health.variant}
                />
                <StatCard
                    label="Avg Latency"
                    value={
                        <span>
                            {formatDurationMs(ds?.avg_ms)}
                            {ds ? <span className="ml-2 text-body font-body text-subtext-color">p95 {formatDurationMs(ds.p95_ms)}</span> : null}
                        </span>
                    }
                    icon={<FeatherClock />}
                />
                <StatCard
                    label="Total Tokens"
                    value={compactNumber(ts.total_tokens)}
                    icon={<FeatherZap />}
                />
            </div>

            {hourlyBuckets.length > 1 ? (
                <div className="grid w-full grid-cols-1 gap-6 xl:grid-cols-3">
                    <SectionCard title="Runs Over Time" description="Success and failure counts per hour">
                        <AreaChart
                            className="h-52 w-full"
                            stacked
                            data={runsChartData}
                            categories={["Success", "Failure"]}
                            index="time"
                            colors={["#22c55e", "#ef4444"]}
                        />
                    </SectionCard>
                    <SectionCard title="Token Usage" description="Tokens consumed per hour">
                        <AreaChart
                            className="h-52 w-full"
                            data={tokensChartData}
                            categories={["Tokens"]}
                            index="time"
                            colors={["#8b5cf6"]}
                        />
                    </SectionCard>
                    <SectionCard title="Latency" description="Average run duration per hour">
                        <AreaChart
                            className="h-52 w-full"
                            data={latencyChartData}
                            categories={["Avg (ms)"]}
                            index="time"
                            colors={["#3b82f6"]}
                        />
                    </SectionCard>
                </div>
            ) : null}

            {agent.metadata && Object.keys(agent.metadata).length > 0 ? (
                <div className="flex w-full flex-col gap-2">
                    <span className="text-body-bold font-body-bold text-default-font">Metadata</span>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {Object.entries(agent.metadata).map(([k, v]) => (
                            <div key={k} className="flex flex-col rounded-md border border-solid border-neutral-border bg-default-background p-3">
                                <span className="text-caption font-caption text-subtext-color">{k}</span>
                                <span className="text-body font-body text-default-font break-all">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {Object.keys(ts.by_model).length > 0 ? (
                <div className="flex w-full flex-col gap-2">
                    <span className="text-body-bold font-body-bold text-default-font">Token Usage by Model</span>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(ts.by_model).map(([model, count]) => (
                            <div key={model} className="flex items-center gap-2 rounded-md border border-solid border-neutral-border bg-default-background px-3 py-2">
                                <span className="text-caption font-caption text-subtext-color">{model}</span>
                                <span className="text-body-bold font-body-bold text-default-font">{compactNumber(count)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}


            <div className="flex w-full flex-col gap-3">
                <div className="flex items-center justify-between">
                    <span className="text-body-bold font-body-bold text-default-font">Recent Runs</span>
                    <Link
                        href={`/runs?agent_name=${encodeURIComponent(agent.name)}`}
                        className="text-caption font-caption text-brand-600 hover:text-brand-700"
                    >
                        View all runs
                    </Link>
                </div>
                {runs.length === 0 ? (
                    <span className="py-6 text-center text-body font-body text-subtext-color">No runs found for this agent</span>
                ) : (
                    <div className="flex w-full flex-col gap-2">
                        {runs.map((run) => (
                            <div
                                key={run.run_id}
                                className="flex w-full items-center gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-4 py-3 shadow-sm hover:border-brand-200 transition-colors"
                            >
                                <Link
                                    href={`/runs/${run.run_id}`}
                                    className="flex min-w-0 grow items-center gap-4"
                                >
                                    <Badge variant={getStatusVariant(run.status)}>{run.status}</Badge>
                                    <span className="text-caption font-caption text-subtext-color font-mono truncate max-w-[140px]">{run.run_id.slice(0, 8)}</span>
                                    <span className="text-caption font-caption text-subtext-color">{durationLabel(run.started_at, run.finished_at)}</span>
                                    {run.total_tokens ? (
                                        <span className="text-caption font-caption text-subtext-color">{compactNumber(run.total_tokens)} tokens</span>
                                    ) : null}
                                    <span className="grow" />
                                    <span className="text-caption font-caption text-subtext-color">{relativeTime(run.started_at ?? run.created_at)}</span>
                                </Link>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {errors.length > 0 ? (
                <div className="flex w-full flex-col gap-3">
                    <span className="text-body-bold font-body-bold text-default-font">Top Errors</span>
                    <div className="flex w-full flex-col gap-2">
                        {errors.map((err, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-3 rounded-md border border-solid border-error-200 bg-error-50 px-4 py-3"
                            >
                                <FeatherAlertCircle className="h-4 w-4 flex-none text-error-600" />
                                <span className="grow text-caption font-caption text-error-700 truncate">{err.error_prefix}</span>
                                <Badge variant="error">{err.count}x</Badge>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
