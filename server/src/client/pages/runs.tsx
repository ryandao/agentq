"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    FeatherAlertCircle,
    FeatherChevronDown,
    FeatherChevronLeft,
    FeatherChevronRight,
    FeatherDatabase,
    FeatherFilter,
    FeatherLoader,
    FeatherSearch,
    FeatherX,
    FeatherZap,
} from "@subframe/core";
import { Badge } from "@/src/ui/components/Badge";
import { AreaChart } from "@/src/ui/components/AreaChart";
import type { AgentSummary, ObservedRunSummary, RunSearchFilters, RunSearchResponse, RunStatsResponse } from "@/src/client/api";
import { fetchAgents, fetchRunSearch } from "@/src/client/api";
import { useRuns, useRunStats } from "@/src/client/lib/hooks";
import { compactNumber, relativeTime, durationLabel } from "@/src/client/lib/format";
import { makeTimeRange, deriveTimeRange } from "@/src/client/lib/time-range";
import type { TimeRange, TimeRangePreset } from "@/src/client/lib/types";
import { TIME_RANGE_PRESETS } from "@/src/client/lib/types";
import { getStatusVariant } from "@/src/client/lib/helpers";
import { TimeRangeSelector } from "@/src/client/components/time-range-selector";
import {
    ErrorBanner,
    EmptyState,
    StatCard,
    SectionCard,
    SectionHeader,
    LoadingPanel,
    DismissibleBanner,
    getStatusIcon,
} from "@/src/client/components/shared";

const STATUS_BORDER_COLOR: Record<string, string> = {
    SUCCESS: "border-l-success-500",
    FAILURE: "border-l-error-500",
    ABORTED: "border-l-error-500",
    RUNNING: "border-l-warning-500",
    PENDING: "border-l-neutral-400",
};

function RunCard({ run }: { run: ObservedRunSummary }) {
    const borderColor = STATUS_BORDER_COLOR[run.status] || "border-l-neutral-300";
    return (
        <Link
            href={`/runs/${run.run_id}`}
            className={`group flex w-full items-center gap-4 rounded-md border border-solid border-neutral-border border-l-[3px] ${borderColor} bg-default-background px-5 py-4 transition-all hover:border-neutral-300 hover:bg-neutral-100/50`}
        >
            <Badge variant={getStatusVariant(run.status)} icon={getStatusIcon(run.status)}>
                {run.status}
            </Badge>
            <div className="flex min-w-0 grow shrink-0 basis-0 flex-col items-start gap-1.5">
                <span className="text-body-bold font-body-bold text-default-font truncate w-full">
                    {run.task_name || run.latest_span_name || run.run_id}
                </span>
                <div className="flex w-full flex-wrap items-center gap-2">
                    {run.models && run.models.length > 0
                        ? run.models.map((model) => (
                              <span
                                  key={model}
                                  className="rounded bg-brand-100 px-1.5 py-0.5 font-monospace-body text-[10px] text-brand-700 whitespace-nowrap"
                              >
                                  {model}
                              </span>
                          ))
                        : null}
                </div>
            </div>
            <div className="hidden flex-col items-end gap-1 md:flex">
                <span className="text-caption font-caption text-subtext-color whitespace-nowrap">
                    {relativeTime(run.started_at)}
                </span>
                <span className="font-monospace-body text-[12px] text-neutral-600 whitespace-nowrap">
                    {durationLabel(run.started_at, run.finished_at)}
                </span>
            </div>
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded bg-neutral-200/70 px-2 py-1">
                    <FeatherZap className="h-3 w-3 text-neutral-500" />
                    <span className="font-monospace-body text-[11px] text-neutral-500">{compactNumber(run.total_tokens ?? 0)}</span>
                </div>
                <FeatherChevronRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-0.5" />
            </div>
        </Link>
    );
}

function RunDensityChart({
    stats,
    timeRange,
    onBrushSelect,
}: {
    stats: RunStatsResponse | null;
    timeRange: TimeRange;
    onBrushSelect: (from: Date, to: Date) => void;
}) {
    const data = useMemo(() => {
        if (!stats?.buckets.length) return [];
        return stats.buckets.map((b) => ({
            time: new Date(b.time).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            }),
            Running: b.running,
            Failure: b.failed,
            Success: b.success,
        }));
    }, [stats]);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dragState, setDragState] = useState<{ startX: number; currentX: number } | null>(null);

    const getRelativeX = useCallback((e: React.MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return 0;
        return Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    }, []);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            const x = getRelativeX(e);
            setDragState({ startX: x, currentX: x });
        },
        [getRelativeX],
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!dragState) return;
            setDragState((prev) => (prev ? { ...prev, currentX: getRelativeX(e) } : null));
        },
        [dragState, getRelativeX],
    );

    const handleMouseUp = useCallback(() => {
        if (!dragState || !containerRef.current) {
            setDragState(null);
            return;
        }
        const rect = containerRef.current.getBoundingClientRect();
        const leftPct = Math.min(dragState.startX, dragState.currentX) / rect.width;
        const rightPct = Math.max(dragState.startX, dragState.currentX) / rect.width;

        if (rightPct - leftPct > 0.03) {
            const fromMs = timeRange.from.getTime();
            const duration = timeRange.to.getTime() - fromMs;
            onBrushSelect(new Date(fromMs + leftPct * duration), new Date(fromMs + rightPct * duration));
        }
        setDragState(null);
    }, [dragState, timeRange, onBrushSelect]);

    const brushLeft = dragState ? Math.min(dragState.startX, dragState.currentX) : 0;
    const brushWidth = dragState ? Math.abs(dragState.currentX - dragState.startX) : 0;

    return (
        <div
            ref={containerRef}
            className="relative cursor-crosshair select-none rounded-md bg-neutral-0 p-3 ring-1 ring-neutral-200"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setDragState(null)}
        >
            <AreaChart
                className="h-48 w-full [&_.recharts-cartesian-grid-horizontal_line]:stroke-neutral-200 [&_.recharts-cartesian-grid-vertical_line]:stroke-transparent [&_.recharts-cartesian-axis-tick-value]:fill-neutral-500 [&_.recharts-cartesian-axis-tick-value]:text-[11px] [&_.recharts-area-area]:opacity-40"
                stacked
                data={data}
                index="time"
                categories={["Running", "Failure", "Success"]}
                colors={["#a78bfa", "#ef4444", "#22c55e"]}
                margin={{ top: 8, right: 8, bottom: 0, left: 4 }}
            />
            {dragState && brushWidth > 2 ? (
                <div
                    className="pointer-events-none absolute top-0 bottom-0 border-x-2 border-brand-500 bg-brand-300/20"
                    style={{ left: brushLeft, width: brushWidth }}
                />
            ) : null}
        </div>
    );
}

const RUNS_PAGE_SIZE = 25;
const EMPTY_FILTERS: RunSearchFilters = {};
const ALL_STATUSES = ["SUCCESS", "FAILURE", "RUNNING", "PENDING", "ABORTED"] as const;
const DURATION_PRESETS: { label: string; value: { min_duration_ms?: number; max_duration_ms?: number } }[] = [
    { label: "< 10s", value: { max_duration_ms: 10_000 } },
    { label: "< 1m", value: { max_duration_ms: 60_000 } },
    { label: "> 1m", value: { min_duration_ms: 60_000 } },
    { label: "> 5m", value: { min_duration_ms: 300_000 } },
];
const TOKEN_PRESETS = [
    { label: "> 10k", value: { min_tokens: 10_000 } },
    { label: "> 50k", value: { min_tokens: 50_000 } },
    { label: "> 100k", value: { min_tokens: 100_000 } },
] as const;

function countActiveFilters(f: RunSearchFilters): number {
    let count = 0;
    if (f.status?.length) count++;
    if (f.agent_name) count++;
    if (f.date_from || f.date_to) count++;
    if (f.min_tokens != null || f.max_tokens != null) count++;
    if (f.min_duration_ms != null || f.max_duration_ms != null) count++;
    if (f.text) count++;
    return count;
}

function isFiltersEmpty(f: RunSearchFilters): boolean {
    return countActiveFilters(f) === 0;
}

function ManualFilterBar({
    filters,
    onChange,
    agents,
}: {
    filters: RunSearchFilters;
    onChange: (next: RunSearchFilters) => void;
    agents: AgentSummary[];
}) {
    const agentInputRef = useRef<HTMLInputElement>(null);
    const [agentInputValue, setAgentInputValue] = useState(filters.agent_name ?? "");
    const [showAgentSuggestions, setShowAgentSuggestions] = useState(false);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setAgentInputValue(filters.agent_name ?? "");
    }, [filters.agent_name]);

    useEffect(() => {
        if (!showAgentSuggestions) return;
        function handleClickOutside(e: MouseEvent) {
            if (
                suggestionsRef.current &&
                !suggestionsRef.current.contains(e.target as Node) &&
                agentInputRef.current &&
                !agentInputRef.current.contains(e.target as Node)
            ) {
                setShowAgentSuggestions(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showAgentSuggestions]);

    const filteredAgents = agents.filter((a) =>
        a.name.toLowerCase().includes(agentInputValue.toLowerCase()),
    );

    const toggleStatus = (s: string) => {
        const current = filters.status ?? [];
        const next = current.includes(s)
            ? current.filter((x) => x !== s)
            : [...current, s];
        onChange({ ...filters, status: next.length ? next : undefined });
    };

    const activeDuration = DURATION_PRESETS.find(
        (p) =>
            (p.value.min_duration_ms ?? undefined) === filters.min_duration_ms &&
            (p.value.max_duration_ms ?? undefined) === filters.max_duration_ms,
    );

    const activeTokens = TOKEN_PRESETS.find(
        (p) =>
            p.value.min_tokens === filters.min_tokens &&
            (filters.max_tokens == null),
    );

    return (
        <div className="flex w-full flex-wrap items-end gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-5 py-4">
            <div className="flex flex-col gap-1.5">
                <span className="text-caption font-caption text-subtext-color">Status</span>
                <div className="flex flex-wrap gap-1">
                    {ALL_STATUSES.map((s) => {
                        const active = filters.status?.includes(s);
                        return (
                            <button
                                key={s}
                                type="button"
                                onClick={() => toggleStatus(s)}
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                    active
                                        ? "bg-brand-100 text-brand-700 border border-solid border-brand-300"
                                        : "bg-neutral-100 text-neutral-600 border border-solid border-neutral-200 hover:bg-neutral-200"
                                }`}
                            >
                                {s}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="relative flex flex-col gap-1.5">
                <span className="text-caption font-caption text-subtext-color">Agent</span>
                <input
                    ref={agentInputRef}
                    type="text"
                    value={agentInputValue}
                    placeholder="Agent name..."
                    onFocus={() => setShowAgentSuggestions(true)}
                    onChange={(e) => {
                        setAgentInputValue(e.target.value);
                        setShowAgentSuggestions(true);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            onChange({ ...filters, agent_name: agentInputValue || undefined });
                            setShowAgentSuggestions(false);
                        }
                    }}
                    onBlur={() => {
                        setTimeout(() => {
                            onChange({ ...filters, agent_name: agentInputValue || undefined });
                        }, 200);
                    }}
                    className="w-40 rounded-md border border-solid border-neutral-border bg-default-background px-2.5 py-1.5 text-caption font-caption text-default-font placeholder:text-neutral-400 outline-none focus:border-brand-500"
                />
                {showAgentSuggestions && filteredAgents.length > 0 ? (
                    <div
                        ref={suggestionsRef}
                        className="absolute left-0 top-full z-10 mt-1 max-h-48 w-56 overflow-y-auto rounded-md border border-solid border-neutral-border bg-default-background shadow-lg"
                    >
                        {filteredAgents.map((a) => (
                            <button
                                key={a.id}
                                type="button"
                                className="flex w-full items-center px-3 py-2 text-caption font-caption text-default-font hover:bg-neutral-100"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    setAgentInputValue(a.name);
                                    onChange({ ...filters, agent_name: a.name });
                                    setShowAgentSuggestions(false);
                                }}
                            >
                                {a.name}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
                <span className="text-caption font-caption text-subtext-color">Duration</span>
                <div className="flex gap-1">
                    {DURATION_PRESETS.map((p) => {
                        const active = activeDuration?.label === p.label;
                        return (
                            <button
                                key={p.label}
                                type="button"
                                onClick={() => {
                                    if (active) {
                                        onChange({ ...filters, min_duration_ms: undefined, max_duration_ms: undefined });
                                    } else {
                                        onChange({
                                            ...filters,
                                            min_duration_ms: p.value.min_duration_ms,
                                            max_duration_ms: p.value.max_duration_ms,
                                        });
                                    }
                                }}
                                className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                                    active
                                        ? "bg-brand-100 text-brand-700 border border-solid border-brand-300"
                                        : "bg-neutral-100 text-neutral-600 border border-solid border-neutral-200 hover:bg-neutral-200"
                                }`}
                            >
                                {p.label}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="flex flex-col gap-1.5">
                <span className="text-caption font-caption text-subtext-color">Tokens</span>
                <div className="flex gap-1">
                    {TOKEN_PRESETS.map((p) => {
                        const active = activeTokens?.label === p.label;
                        return (
                            <button
                                key={p.label}
                                type="button"
                                onClick={() => {
                                    if (active) {
                                        onChange({ ...filters, min_tokens: undefined, max_tokens: undefined });
                                    } else {
                                        onChange({ ...filters, min_tokens: p.value.min_tokens, max_tokens: undefined });
                                    }
                                }}
                                className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                                    active
                                        ? "bg-brand-100 text-brand-700 border border-solid border-brand-300"
                                        : "bg-neutral-100 text-neutral-600 border border-solid border-neutral-200 hover:bg-neutral-200"
                                }`}
                            >
                                {p.label}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="flex flex-col gap-1.5">
                <span className="text-caption font-caption text-subtext-color">Text</span>
                <input
                    type="text"
                    value={filters.text ?? ""}
                    placeholder="error, worker..."
                    onChange={(e) => onChange({ ...filters, text: e.target.value || undefined })}
                    className="w-36 rounded-md border border-solid border-neutral-border bg-default-background px-2.5 py-1.5 text-caption font-caption text-default-font placeholder:text-neutral-400 outline-none focus:border-brand-500"
                />
            </div>
        </div>
    );
}

export function RunsPageView() {
    const [timeRange, setTimeRange] = useState<TimeRange>(() => makeTimeRange("24h"));
    const [page, setPage] = useState(1);
    const [activeFilters, setActiveFilters] = useState<RunSearchFilters>(EMPTY_FILTERS);
    const [filtersExpanded, setFiltersExpanded] = useState(false);

    const [searchQuery, setSearchQuery] = useState("");
    const [searchResponse, setSearchResponse] = useState<RunSearchResponse | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [agents, setAgents] = useState<AgentSummary[]>([]);

    useEffect(() => {
        fetchAgents()
            .then((res) => setAgents(res.agents))
            .catch(() => {});
    }, []);

    const isSearchActive = searchResponse !== null;

    const { data: statsData, isLoading: statsLoading, errorMessage: statsError } = useRunStats(timeRange);

    const runsParams = useMemo(() => ({
        page,
        pageSize: RUNS_PAGE_SIZE,
        from: timeRange.from.toISOString(),
        to: timeRange.to.toISOString(),
        ...(activeFilters.status?.length ? { status: activeFilters.status } : {}),
        ...(activeFilters.agent_name ? { agentName: activeFilters.agent_name } : {}),
        ...(activeFilters.text ? { text: activeFilters.text } : {}),
    }), [page, timeRange, activeFilters]);

    const { data: runsData, isLoading: runsLoading, errorMessage: runsError } = useRuns(runsParams);

    const displayRuns = isSearchActive
        ? searchResponse?.results.runs ?? []
        : runsData?.runs ?? [];
    const totalRuns = isSearchActive
        ? searchResponse?.results.total ?? 0
        : runsData?.total ?? 0;
    const totalPages = isSearchActive
        ? searchResponse?.results.totalPages ?? 1
        : runsData?.totalPages ?? 1;

    const errorMessage = statsError || runsError;

    const handlePresetChange = useCallback(
        (preset: TimeRangePreset) => {
            setTimeRange(makeTimeRange(preset));
            setPage(1);
        },
        [],
    );

    const handleCustomRange = useCallback(
        (from: Date, to: Date) => {
            setTimeRange({ from, to, preset: "custom" });
            setPage(1);
        },
        [],
    );

    const handleNLSearch = useCallback(async (query: string) => {
        if (!query.trim()) return;
        setIsSearching(true);
        setSearchError(null);
        setPage(1);
        try {
            const result = await fetchRunSearch(query.trim());
            setSearchResponse(result);
            setActiveFilters(result.filters);
            setFiltersExpanded(true);
            if (result.filters.date_from && result.filters.date_to) {
                setTimeRange({
                    from: new Date(result.filters.date_from),
                    to: new Date(result.filters.date_to),
                    preset: "custom",
                });
            } else {
                const derived = deriveTimeRange(result.results.runs);
                if (derived) setTimeRange(derived);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : "Search failed";
            setSearchError(msg);
            setFiltersExpanded(true);
        } finally {
            setIsSearching(false);
        }
    }, []);

    const handleFilterChange = useCallback(
        (next: RunSearchFilters) => {
            setActiveFilters(next);
            setPage(1);
            if (isFiltersEmpty(next)) {
                setSearchResponse(null);
            }
        },
        [],
    );

    const handleClearAll = useCallback(() => {
        setSearchQuery("");
        setSearchResponse(null);
        setActiveFilters(EMPTY_FILTERS);
        setSearchError(null);
        setFiltersExpanded(false);
        setTimeRange(makeTimeRange("24h"));
        setPage(1);
    }, []);

    const activeFilterCount = countActiveFilters(activeFilters);

    const statsOrSearch = isSearchActive ? null : statsData;
    const statTotals = statsOrSearch?.totals;

    return (
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8">
            <div className="flex w-full flex-col items-start gap-2">
                <span className="text-heading-1 font-heading-1 text-default-font">Runs</span>
                <span className="text-body font-body text-subtext-color">
                    Monitor and browse all task runs across your workers
                </span>
            </div>

            <div className="flex w-full flex-col gap-3">
                <div className="relative flex w-full items-center">
                    <div className="pointer-events-none absolute left-3 flex items-center">
                        {isSearching ? (
                            <FeatherLoader className="h-4 w-4 text-neutral-400 animate-spin" />
                        ) : (
                            <FeatherSearch className="h-4 w-4 text-neutral-400" />
                        )}
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        placeholder='Search runs... e.g. "failed runs on 3/20"'
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleNLSearch(searchQuery);
                        }}
                        className="w-full rounded-md border border-solid border-neutral-border bg-default-background py-2.5 pl-10 pr-20 text-body font-body text-default-font placeholder:text-neutral-400 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                    <div className="absolute right-2 flex items-center gap-1">
                        {searchQuery ? (
                            <button
                                type="button"
                                onClick={handleClearAll}
                                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                            >
                                <FeatherX className="h-4 w-4" />
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => handleNLSearch(searchQuery)}
                            disabled={!searchQuery.trim() || isSearching}
                            className="rounded-md bg-brand-600 px-3 py-1 text-caption font-caption text-white transition-colors hover:bg-brand-700 disabled:opacity-40 disabled:pointer-events-none"
                        >
                            Search
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setFiltersExpanded(!filtersExpanded)}
                        className={`flex items-center gap-1.5 rounded-md border border-solid px-3 py-1.5 text-caption font-caption transition-colors ${
                            filtersExpanded || activeFilterCount > 0
                                ? "border-brand-300 bg-brand-50 text-brand-700"
                                : "border-neutral-border bg-default-background text-subtext-color hover:bg-neutral-100"
                        }`}
                    >
                        <FeatherFilter className="h-3.5 w-3.5" />
                        Filters
                        {activeFilterCount > 0 ? (
                            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                                {activeFilterCount}
                            </span>
                        ) : null}
                        <FeatherChevronDown
                            className={`h-3 w-3 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
                        />
                    </button>
                    {isSearchActive || activeFilterCount > 0 ? (
                        <button
                            type="button"
                            onClick={handleClearAll}
                            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-caption font-caption text-error-600 hover:bg-error-50 transition-colors"
                        >
                            <FeatherX className="h-3 w-3" />
                            Clear all
                        </button>
                    ) : null}
                </div>

                {filtersExpanded ? (
                    <ManualFilterBar
                        filters={activeFilters}
                        onChange={handleFilterChange}
                        agents={agents}
                    />
                ) : null}
            </div>

            {searchError ? (
                <DismissibleBanner message={searchError} onDismiss={() => setSearchError(null)} />
            ) : null}
            {errorMessage && !isSearchActive ? <ErrorBanner message={errorMessage} /> : null}

            {!isSearchActive ? (
                <SectionCard
                    title="Run Activity"
                    description="Drag across the chart to zoom into a time range"
                    action={
                        <TimeRangeSelector
                            timeRange={timeRange}
                            onPresetChange={handlePresetChange}
                            onCustomRange={handleCustomRange}
                        />
                    }
                >
                    <RunDensityChart
                        stats={statsData}
                        timeRange={timeRange}
                        onBrushSelect={handleCustomRange}
                    />
                </SectionCard>
            ) : null}

            <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard label="Total Runs" value={statTotals?.runs ?? totalRuns} icon={<FeatherDatabase />} variant="brand" />
                <StatCard
                    label="Running"
                    value={statTotals?.running ?? "-"}
                    icon={<FeatherLoader />}
                    variant="warning"
                />
                <StatCard
                    label="Failures"
                    value={statTotals?.failed ?? "-"}
                    icon={<FeatherAlertCircle />}
                    variant="error"
                />
                <StatCard
                    label="Total Tokens"
                    value={compactNumber(statTotals?.tokens ?? 0)}
                    icon={<FeatherZap />}
                    variant="success"
                />
            </div>
            {(statsLoading || runsLoading) && !runsData && !isSearchActive ? <LoadingPanel message="Loading runs..." /> : null}
            {isSearching ? <LoadingPanel message="Searching runs..." /> : null}
            <div className="flex w-full flex-col items-start gap-3">
                <SectionHeader
                    title="Runs"
                    description={
                        displayRuns.length === 0
                            ? "No runs found"
                            : `Showing ${(page - 1) * RUNS_PAGE_SIZE + 1}–${Math.min(page * RUNS_PAGE_SIZE, totalRuns)} of ${totalRuns} runs`
                    }
                />
                {displayRuns.length === 0 ? (
                    <EmptyState
                        title={isSearchActive ? "No runs match your search" : "No runs in this time range"}
                        description={
                            isSearchActive
                                ? "Try adjusting your filters or search query."
                                : "Try selecting a different time range or wait for new runs."
                        }
                    />
                ) : (
                    <>
                        <div className="flex w-full flex-col gap-2.5">
                            {displayRuns.map((run) => (
                                <RunCard key={run.run_id} run={run} />
                            ))}
                        </div>
                        {totalPages > 1 ? (
                            <div className="flex w-full items-center justify-between pt-2">
                                <button
                                    type="button"
                                    disabled={page <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="flex items-center gap-1 rounded-md border border-solid border-neutral-border bg-default-background px-3 py-1.5 text-caption font-caption text-default-font transition-colors hover:bg-neutral-200 disabled:pointer-events-none disabled:opacity-40"
                                >
                                    <FeatherChevronLeft className="h-3.5 w-3.5" />
                                    Previous
                                </button>
                                <span className="text-caption font-caption text-subtext-color">
                                    Page {page} of {totalPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={page >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className="flex items-center gap-1 rounded-md border border-solid border-neutral-border bg-default-background px-3 py-1.5 text-caption font-caption text-default-font transition-colors hover:bg-neutral-200 disabled:pointer-events-none disabled:opacity-40"
                                >
                                    Next
                                    <FeatherChevronRight className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    );
}
