"use client";

import { ReactNode, useCallback, useMemo, useState } from "react";
import {
    FeatherActivity,
    FeatherAlertCircle,
    FeatherCpu,
    FeatherDatabase,
    FeatherHash,
    FeatherLayers,
    FeatherLoader,
    FeatherPlay,
    FeatherServer,
    FeatherTrendingUp,
    FeatherZap,
} from "@subframe/core";
import { Badge } from "@/src/ui/components/Badge";
import { AreaChart } from "@/src/ui/components/AreaChart";
import { BarChart } from "@/src/ui/components/BarChart";
import { IconWithBackground } from "@/src/ui/components/IconWithBackground";
import { Progress } from "@/src/ui/components/Progress";
import { Tabs } from "@/src/ui/components/Tabs";
import type {
    InfraAnalyticsResponse,
    InfraSuggestion,
    InfraSuggestionCategory,
    InfraSnapshotResponse,
    ObservabilityBrokerQueue,
    ObservabilityWorker,
} from "@/src/client/api";
import { useInfraSnapshot, useInfraSuggestions, useInfraAnalytics, useQueueHistory } from "@/src/client/lib/hooks";
import { makeTimeRange } from "@/src/client/lib/time-range";
import type { TimeRange, TimeRangePreset, InfraTab } from "@/src/client/lib/types";
import {
    ErrorBanner,
    EmptyState,
    StatCard,
    SectionHeader,
    SectionCard,
    LoadingPanel,
    QueueErrors,
} from "@/src/client/components/shared";
import { TimeRangeSelector } from "@/src/client/components/time-range-selector";

function WorkerCard({ worker }: { worker: ObservabilityWorker }) {
    return (
        <div className="flex flex-col items-start gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-5 shadow-sm">
            <div className="flex w-full items-center gap-3">
                <div className="flex h-3 w-3 flex-none rounded-full bg-success-500" />
                <span className="grow shrink-0 basis-0 text-body-bold font-body-bold text-default-font truncate">
                    {worker.name}
                </span>
            </div>
            <div className="flex w-full flex-wrap items-start gap-3">
                <div className="flex min-w-[80px] grow shrink-0 basis-0 flex-col items-center gap-1 rounded-md bg-neutral-100 px-4 py-3">
                    <span className="text-heading-3 font-heading-3 text-default-font">{worker.active_count}</span>
                    <span className="text-caption font-caption text-subtext-color">Active</span>
                </div>
                <div className="flex min-w-[80px] grow shrink-0 basis-0 flex-col items-center gap-1 rounded-md bg-neutral-100 px-4 py-3">
                    <span className="text-heading-3 font-heading-3 text-default-font">{worker.reserved_count}</span>
                    <span className="text-caption font-caption text-subtext-color">Reserved</span>
                </div>
                <div className="flex min-w-[80px] grow shrink-0 basis-0 flex-col items-center gap-1 rounded-md bg-neutral-100 px-4 py-3">
                    <span className="text-heading-3 font-heading-3 text-default-font">{worker.scheduled_count}</span>
                    <span className="text-caption font-caption text-subtext-color">Scheduled</span>
                </div>
            </div>
            {worker.queues.length > 0 ? (
                <div className="flex w-full flex-wrap items-center gap-2">
                    {worker.queues.map((queue) => (
                        <Badge key={queue} variant="neutral">{queue}</Badge>
                    ))}
                </div>
            ) : null}
            <div className="flex h-px w-full flex-none bg-neutral-200" />
            <div className="flex w-full flex-wrap items-center gap-4">
                {worker.pid ? (
                    <div className="flex items-center gap-1">
                        <FeatherHash className="text-caption font-caption text-subtext-color" />
                        <span className="text-caption font-caption text-subtext-color">PID: {worker.pid}</span>
                    </div>
                ) : null}
                {worker.uptime ? (
                    <div className="flex items-center gap-1">
                        <FeatherClock className="text-caption font-caption text-subtext-color" />
                        <span className="text-caption font-caption text-subtext-color">Uptime: {worker.uptime}s</span>
                    </div>
                ) : null}
                {worker.broker ? (
                    <div className="flex items-center gap-1">
                        <FeatherDatabase className="text-caption font-caption text-subtext-color" />
                        <span className="text-caption font-caption text-subtext-color">{worker.broker}</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function BrokerQueueCard({ queue }: { queue: ObservabilityBrokerQueue }) {
    const bucketEntries = Object.entries(queue.priority_buckets).filter(
        ([, count]) => count > 0,
    );

    return (
        <div className="flex w-full flex-col items-start gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-5 shadow-sm">
            <div className="flex w-full items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <span className="text-body-bold font-body-bold text-default-font">{queue.name}</span>
                    {queue.is_default ? <Badge variant="brand">Default</Badge> : null}
                </div>
            </div>
            <div className="flex w-full items-start gap-8">
                <div className="flex flex-col items-start gap-1">
                    <span className="text-caption font-caption text-subtext-color">Pending</span>
                    <span className={`text-heading-2 font-heading-2 ${queue.pending_count > 100 ? "text-warning-600" : "text-default-font"}`}>
                        {queue.pending_count}
                    </span>
                </div>
                {bucketEntries.length > 0 ? (
                    <>
                        <div className="h-12 w-px flex-none bg-neutral-200" />
                        <div className="flex grow shrink-0 basis-0 flex-col items-start gap-2">
                            <span className="text-caption font-caption text-subtext-color">Priority Buckets</span>
                            <div className="flex w-full flex-wrap items-start gap-2">
                                {bucketEntries.map(([bucketName, count]) => (
                                    <div
                                        key={`${queue.name}-${bucketName}`}
                                        className="flex items-center gap-2 rounded-md bg-neutral-200 px-3 py-1.5"
                                    >
                                        <span className="text-caption-bold font-caption-bold text-neutral-700">{bucketName}</span>
                                        <span className="text-caption font-caption text-neutral-600">{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <span className="text-caption font-caption text-subtext-color self-center">
                        No queued jobs in any priority bucket.
                    </span>
                )}
            </div>
        </div>
    );
}

const CATEGORY_ICONS: Record<InfraSuggestionCategory, ReactNode> = {
    capacity: <FeatherTrendingUp className="flex-none" />,
    reliability: <FeatherAlertCircle className="flex-none" />,
    performance: <FeatherClock className="flex-none" />,
    operational: <FeatherServer className="flex-none" />,
};

const CATEGORY_BADGE_LABELS: Record<InfraSuggestionCategory, string> = {
    capacity: "Capacity",
    reliability: "Reliability",
    performance: "Performance",
    operational: "Operational",
};

function MetricContextBar({
    ctx,
}: {
    ctx: NonNullable<InfraSuggestion["metric_context"]>;
}) {
    const max = Math.max(ctx.current, ctx.historical_avg, 1);
    const currentPct = Math.min(100, (ctx.current / max) * 100);
    const histPct = Math.min(100, (ctx.historical_avg / max) * 100);

    return (
        <div className="flex flex-col gap-1.5 rounded-md bg-neutral-100 px-3 py-2 mt-1">
            <span className="text-caption-bold font-caption-bold text-subtext-color">
                {ctx.label}
            </span>
            <div className="flex w-full items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between">
                        <span className="text-caption font-caption text-default-font">Current</span>
                        <span className="text-caption-bold font-caption-bold text-default-font">
                            {ctx.current.toLocaleString()} {ctx.unit}
                        </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-brand-600 transition-all"
                            style={{ width: `${currentPct}%` }}
                        />
                    </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between">
                        <span className="text-caption font-caption text-subtext-color">Historical avg</span>
                        <span className="text-caption-bold font-caption-bold text-subtext-color">
                            {ctx.historical_avg.toLocaleString()} {ctx.unit}
                        </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-neutral-400 transition-all"
                            style={{ width: `${histPct}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function SuggestionCard({ suggestion }: { suggestion: InfraSuggestion }) {
    const borderColor =
        suggestion.severity === "critical"
            ? "border-error-200 bg-error-50"
            : suggestion.severity === "warning"
              ? "border-warning-200 bg-warning-50"
              : "border-neutral-border bg-neutral-50";

    const iconColor =
        suggestion.severity === "critical"
            ? "text-error-600"
            : suggestion.severity === "warning"
              ? "text-warning-600"
              : suggestion.severity === "success"
                ? "text-success-600"
                : "text-brand-600";

    return (
        <div
            className={`flex w-full items-start gap-3 rounded-md border border-solid px-5 py-4 ${borderColor}`}
        >
            <div className={`mt-0.5 ${iconColor}`}>
                {CATEGORY_ICONS[suggestion.category]}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                        variant={
                            suggestion.severity === "critical"
                                ? "error"
                                : suggestion.severity === "warning"
                                  ? "warning"
                                  : suggestion.severity === "success"
                                    ? "success"
                                    : "neutral"
                        }
                    >
                        {suggestion.severity === "success" ? "healthy" : suggestion.severity}
                    </Badge>
                    <Badge variant="neutral">
                        {CATEGORY_BADGE_LABELS[suggestion.category]}
                    </Badge>
                    <span className={`text-body-bold font-body-bold ${suggestion.severity === "success" ? "text-success-600" : "text-default-font"}`}>
                        {suggestion.title}
                    </span>
                </div>
                <span className="text-body font-body text-subtext-color">
                    {suggestion.detail}
                </span>
                {suggestion.metric_context ? (
                    <MetricContextBar ctx={suggestion.metric_context} />
                ) : null}
                <div className={`mt-1 flex items-start gap-2 rounded-md px-3 py-2 border border-solid ${suggestion.severity === "success" ? "bg-success-50 border-success-200" : "bg-brand-50 border-brand-200"}`}>
                    <FeatherZap
                        className={`${suggestion.severity === "success" ? "text-success-600" : "text-brand-600"} flex-none mt-0.5`}
                        style={{ width: 14, height: 14 }}
                    />
                    <span className={`text-body font-body ${suggestion.severity === "success" ? "text-success-700" : "text-brand-700"}`}>
                        {suggestion.action}
                    </span>
                </div>
            </div>
        </div>
    );
}

const DIMENSION_COLORS = [
    "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
    "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#64748b",
];

function pivotHourlyDimension(
    rows: { hour: string; dimension: string; count: number }[],
    renameDimension?: (d: string) => string,
): { data: Record<string, unknown>[]; categories: string[] } {
    const dimensionSet = new Set<string>();
    const hourMap = new Map<string, Record<string, unknown>>();

    for (const r of rows) {
        const label = new Date(r.hour).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
        const dim = renameDimension ? renameDimension(r.dimension) : r.dimension;
        dimensionSet.add(dim);
        let entry = hourMap.get(label);
        if (!entry) {
            entry = { time: label };
            hourMap.set(label, entry);
        }
        entry[dim] = ((entry[dim] as number) ?? 0) + r.count;
    }

    const categories = Array.from(dimensionSet);
    const data: Record<string, unknown>[] = [];
    hourMap.forEach((entry) => data.push(entry));
    for (const row of data) {
        for (const cat of categories) {
            if (!(cat in row)) row[cat] = 0;
        }
    }

    return { data, categories };
}

function InfraMonitoringPanel({
    snapshot,
    taskHistory,
}: {
    snapshot: InfraSnapshotResponse | null;
    taskHistory: {
        time: string;
        active: number;
        reserved: number;
        scheduled: number;
        pending: number;
    }[];
}) {
    const [timeRange, setTimeRange] = useState<TimeRange>(() => makeTimeRange("24h"));

    const handlePresetChange = useCallback((preset: TimeRangePreset) => {
        setTimeRange(makeTimeRange(preset));
    }, []);

    const handleCustomRange = useCallback((from: Date, to: Date) => {
        setTimeRange({ from, to, preset: "custom" });
    }, []);

    const { data: analytics, loading: analyticsLoading } = useInfraAnalytics(timeRange);

    const rangeLabel = timeRange.preset === "custom"
        ? formatCustomLabel(timeRange.from, timeRange.to)
        : timeRange.preset.toUpperCase();

    const { counts, workers, broker_queues } = snapshot ?? {
        counts: {
            workers: 0,
            active_tasks: 0,
            reserved_tasks: 0,
            scheduled_tasks: 0,
            pending_tasks: 0,
            broker_queues: 0,
        },
        workers: [],
        broker_queues: [],
    };

    const totalTasks =
        counts.active_tasks +
        counts.reserved_tasks +
        counts.scheduled_tasks +
        counts.pending_tasks;
    const workerUtilization =
        counts.workers > 0
            ? Math.min(100, (counts.active_tasks / counts.workers) * 100)
            : 0;
    const queuePressure =
        counts.workers > 0
            ? Math.min(100, (counts.pending_tasks / (counts.workers * 5)) * 100)
            : counts.pending_tasks > 0
              ? 100
              : 0;

    const hourlyChartData = useMemo(() => {
        if (!analytics?.hourly_throughput.length) return [];
        return analytics.hourly_throughput.map((r) => ({
            time: new Date(r.hour).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            }),
            Completed: r.count - r.failure_count,
            Failed: r.failure_count,
        }));
    }, [analytics]);

    const { data: hourlyWorkerData, categories: workerCategories } = useMemo(() => {
        const rows = analytics?.hourly_worker_throughput;
        if (!rows?.length) return { data: [] as Record<string, unknown>[], categories: [] as string[] };
        return pivotHourlyDimension(rows, (d) => d.replace(/^celery@/, ""));
    }, [analytics]);

    const { data: hourlyQueueData, categories: queueCategories } = useMemo(() => {
        const rows = analytics?.hourly_queue_throughput;
        if (!rows?.length) return { data: [] as Record<string, unknown>[], categories: [] as string[] };
        return pivotHourlyDimension(rows);
    }, [analytics]);

    const runStatsTotal = useMemo(() => {
        if (!analytics?.run_stats.length) return 0;
        return analytics.run_stats.reduce((s, r) => s + r.count, 0);
    }, [analytics]);

    const failureRate = useMemo(() => {
        if (!analytics?.run_stats.length || runStatsTotal === 0) return 0;
        const failures = analytics.run_stats
            .filter((r) => r.status === "FAILURE")
            .reduce((s, r) => s + r.count, 0);
        return (failures / runStatsTotal) * 100;
    }, [analytics, runStatsTotal]);

    return (
        <div className="flex w-full flex-col gap-6">
            <div className="flex items-center justify-between">
                <span className="text-body-bold font-body-bold text-default-font">
                    Showing metrics for the selected range
                </span>
                <TimeRangeSelector
                    timeRange={timeRange}
                    onPresetChange={handlePresetChange}
                    onCustomRange={handleCustomRange}
                />
            </div>

            <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-4">
                <div className="flex flex-col gap-3 rounded-md border border-solid border-neutral-border bg-default-background px-5 py-5 shadow-sm">
                    <div className="flex items-center gap-2">
                        <IconWithBackground variant={workerUtilization > 85 ? "warning" : "brand"} size="small" icon={<FeatherCpu />} />
                        <span className="text-body font-body text-subtext-color">Worker Utilization</span>
                    </div>
                    <span className="text-heading-2 font-heading-2 text-default-font">
                        {workerUtilization.toFixed(0)}%
                    </span>
                    <Progress value={workerUtilization}>
                        <Progress.Indicator
                            className={
                                workerUtilization > 85
                                    ? "bg-warning-500"
                                    : workerUtilization > 60
                                      ? "bg-brand-500"
                                      : "bg-success-500"
                            }
                        />
                    </Progress>
                    <span className="text-caption font-caption text-subtext-color">
                        {counts.active_tasks} active / {counts.workers} workers
                    </span>
                </div>

                <div className="flex flex-col gap-3 rounded-md border border-solid border-neutral-border bg-default-background px-5 py-5 shadow-sm">
                    <div className="flex items-center gap-2">
                        <IconWithBackground variant={queuePressure > 60 ? "warning" : "neutral"} size="small" icon={<FeatherLayers />} />
                        <span className="text-body font-body text-subtext-color">Queue Pressure</span>
                    </div>
                    <span className="text-heading-2 font-heading-2 text-default-font">
                        {queuePressure.toFixed(0)}%
                    </span>
                    <Progress value={queuePressure}>
                        <Progress.Indicator
                            className={
                                queuePressure > 80
                                    ? "bg-error-500"
                                    : queuePressure > 50
                                      ? "bg-warning-500"
                                      : "bg-success-500"
                            }
                        />
                    </Progress>
                    <span className="text-caption font-caption text-subtext-color">
                        {counts.pending_tasks} pending across {counts.broker_queues} queue(s)
                    </span>
                </div>

                <div className="flex flex-col gap-3 rounded-md border border-solid border-neutral-border bg-default-background px-5 py-5 shadow-sm">
                    <div className="flex items-center gap-2">
                        <IconWithBackground variant="neutral" size="small" icon={<FeatherActivity />} />
                        <span className="text-body font-body text-subtext-color">Throughput ({rangeLabel})</span>
                    </div>
                    <span className="text-heading-2 font-heading-2 text-default-font">
                        {analyticsLoading ? "-" : runStatsTotal.toLocaleString()}
                    </span>
                    <span className="text-caption font-caption text-subtext-color">
                        total tasks processed
                    </span>
                </div>

                <div className="flex flex-col gap-3 rounded-md border border-solid border-neutral-border bg-default-background px-5 py-5 shadow-sm">
                    <div className="flex items-center gap-2">
                        <IconWithBackground variant={failureRate > 10 ? "error" : failureRate > 5 ? "warning" : "success"} size="small" icon={<FeatherAlertCircle />} />
                        <span className="text-body font-body text-subtext-color">Failure Rate ({rangeLabel})</span>
                    </div>
                    <span className="text-heading-2 font-heading-2 text-default-font">
                        {analyticsLoading ? "-" : `${failureRate.toFixed(1)}%`}
                    </span>
                    <Progress value={failureRate}>
                        <Progress.Indicator
                            className={
                                failureRate > 10
                                    ? "bg-error-500"
                                    : failureRate > 5
                                      ? "bg-warning-500"
                                      : "bg-success-500"
                            }
                        />
                    </Progress>
                    <span className="text-caption font-caption text-subtext-color">
                        {analyticsLoading ? "" : `${analytics?.run_stats.filter((r) => r.status === "FAILURE").reduce((s, r) => s + r.count, 0) ?? 0} failed of ${runStatsTotal}`}
                    </span>
                </div>
            </div>

            {hourlyChartData.length > 0 ? (
                <SectionCard title={`Hourly Throughput (${rangeLabel})`} description="Tasks completed and failed per hour">
                    <AreaChart
                        className="h-64 w-full"
                        stacked
                        data={hourlyChartData}
                        categories={["Completed", "Failed"]}
                        index="time"
                        colors={["#22c55e", "#ef4444"]}
                    />
                </SectionCard>
            ) : analyticsLoading ? (
                <LoadingPanel message="Loading historical throughput..." />
            ) : null}

            {hourlyWorkerData.length > 0 ? (
                <SectionCard title={`Worker Load Over Time (${rangeLabel})`} description="Tasks processed per worker per hour">
                    <AreaChart
                        className="h-64 w-full"
                        stacked
                        data={hourlyWorkerData}
                        categories={workerCategories}
                        index="time"
                        colors={DIMENSION_COLORS.slice(0, workerCategories.length)}
                    />
                </SectionCard>
            ) : null}
        </div>
    );
}

export function InfrastructurePageView() {
    const { snapshot, isLoading, errorMessage } = useInfraSnapshot();
    const [activeTab, setActiveTab] = useState<InfraTab>("overview");
    const taskHistory = useQueueHistory(snapshot);
    const {
        data: suggestionsData,
        loading: suggestionsLoading,
        refresh: refreshSuggestions,
    } = useInfraSuggestions(24);
    const suggestions = suggestionsData?.suggestions ?? [];

    const counts = snapshot?.counts;
    const workers = snapshot?.workers ?? [];
    const queues = snapshot?.broker_queues ?? [];
    const queueErrors = snapshot?.errors ?? [];

    return (
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
            <div className="flex w-full items-center justify-between gap-4">
                <div className="flex flex-col items-start gap-2">
                    <span className="text-heading-1 font-heading-1 text-default-font">
                        Infrastructure
                    </span>
                    <span className="text-body font-body text-subtext-color">
                        Workers, queues, and system health at a glance
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="success" icon={<FeatherActivity />}>
                        Live
                    </Badge>
                    <span className="text-caption font-caption text-subtext-color">
                        Polling every 5s
                    </span>
                </div>
            </div>

            {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

            <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Active" value={counts?.active_tasks ?? "-"} icon={<FeatherPlay />} variant="success" />
                <StatCard label="Pending" value={counts?.pending_tasks ?? "-"} icon={<FeatherLoader />} variant="warning" />
                <StatCard label="Workers" value={counts?.workers ?? "-"} icon={<FeatherServer />} variant="brand" />
                <StatCard label="Queues" value={counts?.broker_queues ?? "-"} icon={<FeatherLayers />} variant="neutral" />
            </div>

            <div className="flex w-full flex-col gap-3">
                <SectionHeader
                    title="Suggested Actions"
                    description="Recommendations based on live state and historical metrics"
                    action={
                        <button
                            type="button"
                            disabled={suggestionsLoading}
                            onClick={refreshSuggestions}
                            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-3 py-1.5 text-caption-bold font-caption-bold text-subtext-color hover:bg-neutral-200 hover:text-default-font disabled:opacity-50 transition-colors"
                        >
                            {suggestionsLoading ? (
                                <FeatherLoader className="animate-spin" style={{ width: 14, height: 14 }} />
                            ) : (
                                <FeatherZap style={{ width: 14, height: 14 }} />
                            )}
                            {suggestionsLoading ? "Analyzing..." : "Refresh"}
                        </button>
                    }
                />
                {suggestionsLoading && suggestions.length === 0 ? (
                    <LoadingPanel message="Analyzing infrastructure metrics..." />
                ) : null}
                {suggestions.map((s, idx) => (
                    <SuggestionCard key={idx} suggestion={s} />
                ))}
            </div>

            <Tabs>
                <Tabs.Item
                    active={activeTab === "overview"}
                    icon={<FeatherActivity />}
                    onClick={() => setActiveTab("overview")}
                >
                    Overview
                </Tabs.Item>
                <Tabs.Item
                    active={activeTab === "monitoring"}
                    icon={<FeatherTrendingUp />}
                    onClick={() => setActiveTab("monitoring")}
                >
                    Monitoring
                </Tabs.Item>
            </Tabs>

            {isLoading && !snapshot ? (
                <LoadingPanel message="Loading infrastructure data..." />
            ) : null}

            {activeTab === "overview" && snapshot ? (
                <div className="flex w-full flex-col gap-6">
                    <QueueErrors errors={queueErrors} />
                    <div className="grid w-full grid-cols-1 gap-6 xl:grid-cols-2">
                        <SectionCard
                            title="Workers"
                            description={`${workers.length} worker instance(s)`}
                        >
                            {workers.length === 0 ? (
                                <EmptyState
                                    title="No live workers"
                                    description="Workers will appear when the broker can be inspected."
                                />
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {workers.slice(0, 4).map((worker) => (
                                        <WorkerCard
                                            key={worker.name}
                                            worker={worker}
                                        />
                                    ))}
                                    {workers.length > 4 ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setActiveTab("workers")
                                            }
                                            className="text-caption-bold font-caption-bold text-brand-700 hover:text-brand-800"
                                        >
                                            View all {workers.length} workers
                                        </button>
                                    ) : null}
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard
                            title="Queues"
                            description={`${queues.length} broker queue(s)`}
                        >
                            {queues.length === 0 ? (
                                <EmptyState
                                    title="No broker queues"
                                    description="Queues will show once inspection succeeds."
                                />
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {queues.slice(0, 4).map((queue) => (
                                        <BrokerQueueCard
                                            key={queue.name}
                                            queue={queue}
                                        />
                                    ))}
                                    {queues.length > 4 ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setActiveTab("queues")
                                            }
                                            className="text-caption-bold font-caption-bold text-brand-700 hover:text-brand-800"
                                        >
                                            View all {queues.length} queues
                                        </button>
                                    ) : null}
                                </div>
                            )}
                        </SectionCard>
                    </div>
                </div>
            ) : null}

            {activeTab === "workers" && snapshot ? (
                <SectionCard title="All Workers" description={`${workers.length} worker instance(s)`}>
                    {workers.length === 0 ? (
                        <EmptyState title="No live workers" description="Workers will appear when the broker can be inspected." />
                    ) : (
                        <div className="flex flex-col gap-3">
                            {workers.map((worker) => (
                                <WorkerCard key={worker.name} worker={worker} />
                            ))}
                        </div>
                    )}
                </SectionCard>
            ) : null}

            {activeTab === "queues" && snapshot ? (
                <SectionCard title="All Queues" description={`${queues.length} broker queue(s)`}>
                    {queues.length === 0 ? (
                        <EmptyState title="No broker queues" description="Queues will show once inspection succeeds." />
                    ) : (
                        <div className="flex flex-col gap-3">
                            {queues.map((queue) => (
                                <BrokerQueueCard key={queue.name} queue={queue} />
                            ))}
                        </div>
                    )}
                </SectionCard>
            ) : null}

            {activeTab === "monitoring" ? (
                <InfraMonitoringPanel
                    snapshot={snapshot}
                    taskHistory={taskHistory}
                />
            ) : null}
        </div>
    );
}
