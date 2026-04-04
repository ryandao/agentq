"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
    FeatherAlertCircle,
    FeatherArrowLeft,
    FeatherChevronDown,
    FeatherChevronRight,
    FeatherClock,
    FeatherFolder,
    FeatherHash,
    FeatherLayers,
    FeatherPlay,
    FeatherUser,
} from "@subframe/core";
import { Badge } from "@/src/ui/components/Badge";
import type { ObservedRunSummary, ObservedRunDetailResponse } from "@/src/client/api";
import { fetchObservedRunDetail } from "@/src/client/api";
import { useSessionDetail } from "@/src/client/lib/hooks";
import { durationLabel, relativeTime, previewToString, formatDurationMs, compactNumber } from "@/src/client/lib/format";
import { getStatusVariant } from "@/src/client/lib/helpers";
import {
    ErrorBanner,
    EmptyState,
    StatCard,
    LoadingPanel,
    CollapsiblePre,
    getStatusIcon,
} from "@/src/client/components/shared";

function extractPrompt(inputPreview: unknown): string | null {
    if (!inputPreview || typeof inputPreview !== "object") return null;
    const preview = inputPreview as Record<string, unknown>;

    const kwargs = preview.kwargs as Record<string, unknown> | undefined;
    if (kwargs && typeof kwargs.prompt === "string" && kwargs.prompt.length > 10) {
        return kwargs.prompt;
    }

    const args = preview.args;
    if (Array.isArray(args)) {
        for (const arg of args) {
            if (typeof arg === "string" && arg.length > 20 && !isUuidLike(arg)) {
                return arg;
            }
        }
    }

    return null;
}

function isUuidLike(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function formatTaskName(name: string | null | undefined): string {
    if (!name) return "Unknown Task";
    return name
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function RunExpandedDetail({ runId }: { runId: string }) {
    const [detail, setDetail] = useState<ObservedRunDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetchObservedRunDetail(runId)
            .then((d) => { if (!cancelled) setDetail(d); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [runId]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 py-3 px-4 text-caption font-caption text-subtext-color">
                <FeatherClock className="animate-spin h-3 w-3" />
                Loading spans...
            </div>
        );
    }

    if (!detail || detail.steps.length === 0) {
        return (
            <div className="py-3 px-4 text-caption font-caption text-subtext-color">
                No spans recorded for this run.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 py-3 px-4 border-t border-neutral-100">
            {detail.steps.map((step) => (
                <div key={step.span.span_id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        {getStatusIcon(step.span.status ?? "PENDING")}
                        <span className="text-caption-bold font-caption-bold text-default-font">
                            {step.span.name}
                        </span>
                        <Badge variant="neutral" className="text-[10px]">
                            {step.span.run_type}
                        </Badge>
                        <span className="text-caption font-caption text-subtext-color">
                            {durationLabel(step.span.started_at, step.span.finished_at)}
                        </span>
                    </div>
                    {step.events.length > 0 && (
                        <div className="ml-6 flex flex-col gap-1">
                            {step.events.slice(0, 5).map((evt) => (
                                <div key={evt.id} className="text-caption font-caption text-subtext-color truncate">
                                    <span className="text-caption-bold font-caption-bold">{evt.type}</span>
                                    {evt.name ? `: ${evt.name}` : ""}
                                </div>
                            ))}
                            {step.events.length > 5 && (
                                <span className="text-caption font-caption text-subtext-color">
                                    +{step.events.length - 5} more events
                                </span>
                            )}
                        </div>
                    )}
                    {step.children.length > 0 && (
                        <div className="ml-4 border-l-2 border-neutral-100 pl-3 flex flex-col gap-2">
                            {step.children.map((child) => (
                                <div key={child.span.span_id} className="flex items-center gap-2">
                                    {getStatusIcon(child.span.status ?? "PENDING")}
                                    <span className="text-caption font-caption text-default-font">
                                        {child.span.name}
                                    </span>
                                    <Badge variant="neutral" className="text-[10px]">
                                        {child.span.run_type}
                                    </Badge>
                                    <span className="text-caption font-caption text-subtext-color">
                                        {durationLabel(child.span.started_at, child.span.finished_at)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
            <Link
                href={`/runs/${runId}`}
                className="text-caption font-caption text-brand-600 hover:underline mt-1"
            >
                View full run detail →
            </Link>
        </div>
    );
}

function RunCard({
    run,
    index,
}: {
    run: ObservedRunSummary;
    index: number;
}) {
    const [expanded, setExpanded] = useState(false);
    const prompt = extractPrompt(run.input_preview);
    const statusVariant = getStatusVariant(run.status);
    const duration = durationLabel(run.started_at, run.finished_at);
    const isRunning = run.status === "RUNNING" || run.status === "PENDING";
    const hasFailed = run.status === "FAILURE" || run.status === "ABORTED";

    return (
        <div className="flex flex-col rounded-md border border-solid border-neutral-border bg-default-background shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-start gap-4 px-5 py-4 text-left hover:bg-neutral-50 transition-colors w-full"
            >
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-neutral-100 text-caption-bold font-caption-bold text-subtext-color flex-none mt-0.5">
                    {index + 1}
                </div>
                <div className="flex min-w-0 grow flex-col gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-body-bold font-body-bold text-default-font">
                            {formatTaskName(run.task_name)}
                        </span>
                        <Badge variant={statusVariant}>{run.status}</Badge>
                        <span className="text-caption font-caption text-subtext-color">
                            {duration}
                        </span>
                        {run.total_spans > 0 && (
                            <span className="text-caption font-caption text-subtext-color flex items-center gap-1">
                                <FeatherLayers className="h-3 w-3" />
                                {run.total_spans} spans
                            </span>
                        )}
                    </div>
                    {prompt && (
                        <div className="text-body font-body text-default-font bg-neutral-50 rounded px-3 py-2 border border-neutral-100">
                            {prompt.length > 300 ? `${prompt.slice(0, 300)}...` : prompt}
                        </div>
                    )}
                    {hasFailed && run.error && (
                        <div className="text-caption font-caption text-error-600 bg-error-50 rounded px-3 py-2 border border-error-100">
                            {run.error.length > 200 ? `${run.error.slice(0, 200)}...` : run.error}
                        </div>
                    )}
                    {!hasFailed && run.output_preview != null && (
                        <CollapsiblePre
                            content={previewToString(run.output_preview)}
                            className="bg-neutral-50 border border-neutral-100"
                        />
                    )}
                </div>
                <div className="flex-none mt-1">
                    {expanded ? (
                        <FeatherChevronDown className="h-4 w-4 text-subtext-color" />
                    ) : (
                        <FeatherChevronRight className="h-4 w-4 text-subtext-color" />
                    )}
                </div>
            </button>
            {expanded && <RunExpandedDetail runId={run.run_id} />}
        </div>
    );
}

export function SessionDetailPageView({ sessionId }: { sessionId: string }) {
    const { data, loading, error } = useSessionDetail(sessionId);
    const session = data?.session;
    const runs = data?.runs ?? [];
    const stats = data?.stats;

    const chronologicalRuns = [...runs].sort((a, b) => {
        const aTime = a.started_at || a.created_at || "";
        const bTime = b.started_at || b.created_at || "";
        return aTime.localeCompare(bTime);
    });

    return (
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8">
            <div className="flex items-center gap-3">
                <Link
                    href="/sessions"
                    className="flex items-center gap-1 text-caption font-caption text-subtext-color hover:text-default-font transition-colors"
                >
                    <FeatherArrowLeft className="h-4 w-4" />
                    Sessions
                </Link>
            </div>

            {error ? <ErrorBanner message={error} /> : null}
            {loading && !data ? <LoadingPanel message="Loading session..." /> : null}

            {session && (
                <>
                    <div className="flex w-full flex-col items-start gap-2">
                        <div className="flex items-center gap-3">
                            <FeatherFolder className="text-heading-2 font-heading-2 text-brand-600" />
                            <span className="text-heading-1 font-heading-1 text-default-font">
                                {session.name || session.id}
                            </span>
                            {session.status && session.status !== "empty" && (
                                <Badge variant={getStatusVariant(
                                    session.status === "active" ? "RUNNING"
                                    : session.status === "success" ? "SUCCESS"
                                    : session.status === "failure" ? "FAILURE"
                                    : "PENDING"
                                )}>
                                    {session.status === "active" ? "Active"
                                    : session.status === "success" ? "Success"
                                    : session.status === "failure" ? "Failed"
                                    : session.status}
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-4 flex-wrap text-caption font-caption text-subtext-color">
                            {session.name && (
                                <span className="flex items-center gap-1">
                                    <FeatherHash className="h-3 w-3" />
                                    {session.id}
                                </span>
                            )}
                            {session.user_id && (
                                <span className="flex items-center gap-1">
                                    <FeatherUser className="h-3 w-3" />
                                    {session.user_id}
                                </span>
                            )}
                            <span className="flex items-center gap-1">
                                <FeatherClock className="h-3 w-3" />
                                Started {relativeTime(session.started_at)}
                            </span>
                        </div>
                    </div>

                    {session.summary && (
                        <div className="rounded-md border border-solid border-neutral-border bg-default-background px-5 py-4">
                            <p className="text-body font-body text-default-font leading-relaxed">
                                {session.summary}
                            </p>
                        </div>
                    )}

                    <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-5">
                        <StatCard
                            label="Runs"
                            value={runs.length}
                            icon={<FeatherPlay />}
                            variant="brand"
                        />
                        <StatCard
                            label="Duration"
                            value={stats?.total_duration_ms != null ? formatDurationMs(stats.total_duration_ms) : "-"}
                            icon={<FeatherClock />}
                            variant="neutral"
                        />
                        <StatCard
                            label="Tokens"
                            value={stats ? compactNumber(stats.total_tokens) : "-"}
                            icon={<FeatherLayers />}
                            variant="neutral"
                        />
                        <StatCard
                            label="Succeeded"
                            value={stats?.success_count ?? 0}
                            icon={<FeatherPlay />}
                            variant="success"
                        />
                        <StatCard
                            label="Failed"
                            value={stats?.failure_count ?? 0}
                            icon={<FeatherAlertCircle />}
                            variant={(stats?.failure_count ?? 0) > 0 ? "error" : "neutral"}
                        />
                    </div>

                    {chronologicalRuns.length === 0 ? (
                        <EmptyState
                            title="No runs yet"
                            description="Runs will appear here once they are recorded for this session."
                        />
                    ) : (
                        <div className="flex w-full flex-col gap-3">
                            {chronologicalRuns.map((run, i) => (
                                <RunCard key={run.run_id} run={run} index={i} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
