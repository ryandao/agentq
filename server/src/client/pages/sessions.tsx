"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
    FeatherActivity,
    FeatherAlertCircle,
    FeatherChevronRight,
    FeatherFolder,
    FeatherPlay,
    FeatherSearch,
} from "@subframe/core";
import { Badge } from "@/src/ui/components/Badge";
import type { SessionSummary, SessionFilterParams } from "@/src/client/api";
import { useSessions } from "@/src/client/lib/hooks";
import { relativeTime } from "@/src/client/lib/format";
import {
    ErrorBanner,
    EmptyState,
    StatCard,
    SectionHeader,
    LoadingPanel,
} from "@/src/client/components/shared";

const STATUS_OPTIONS = [
    { value: "", label: "All statuses" },
    { value: "success", label: "Success" },
    { value: "failure", label: "Failed" },
    { value: "active", label: "Active" },
];

export function SessionsPageView() {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    const filters = useMemo<SessionFilterParams>(() => {
        const f: SessionFilterParams = {};
        if (search.trim()) f.search = search.trim();
        if (statusFilter) f.status = statusFilter;
        return f;
    }, [search, statusFilter]);

    const { data, loading, error } = useSessions(100, filters);
    const sessions = data?.sessions ?? [];

    const activeSessions = sessions.filter((s) => s.status === "active").length;
    const failedSessions = sessions.filter((s) => s.status === "failure").length;
    const totalRuns = sessions.reduce((sum, s) => sum + (s.run_count ?? 0), 0);

    return (
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8">
            <div className="flex w-full flex-col items-start gap-2">
                <span className="text-heading-1 font-heading-1 text-default-font">Sessions</span>
                <span className="text-body font-body text-subtext-color">
                    View and manage runs grouped by session
                </span>
            </div>
            {error ? <ErrorBanner message={error} /> : null}
            <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard label="Sessions" value={sessions.length} icon={<FeatherFolder />} variant="brand" />
                <StatCard label="Runs" value={totalRuns} icon={<FeatherPlay />} variant="neutral" />
                <StatCard
                    label="Active"
                    value={activeSessions}
                    icon={<FeatherActivity />}
                    variant={activeSessions > 0 ? "warning" : "neutral"}
                />
                <StatCard
                    label="Failed"
                    value={failedSessions}
                    icon={<FeatherAlertCircle />}
                    variant={failedSessions > 0 ? "error" : "success"}
                />
            </div>
            <div className="flex w-full items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 rounded-md border border-solid border-neutral-border bg-default-background px-3 py-2 grow max-w-xs">
                    <FeatherSearch className="h-4 w-4 text-subtext-color flex-none" />
                    <input
                        type="text"
                        placeholder="Search sessions..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="text-body font-body text-default-font bg-transparent outline-none w-full"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-md border border-solid border-neutral-border bg-default-background px-3 py-2 text-body font-body text-default-font outline-none"
                >
                    {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>

            {loading && !data ? <LoadingPanel message="Loading sessions..." /> : null}
            <div className="flex w-full flex-col items-start gap-4">
                <SectionHeader title="Sessions" description={`${sessions.length} session${sessions.length !== 1 ? "s" : ""}`} />
                {sessions.length === 0 ? (
                    <EmptyState title="No sessions available" description="Sessions will appear once runs include session metadata." />
                ) : (
                    <div className="flex w-full flex-col items-start gap-3">
                        {sessions.map((session) => (
                            <SessionRow key={session.id} session={session} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const SESSION_STATUS_BADGE: Record<string, { variant: "success" | "error" | "warning" | "neutral"; label: string }> = {
    success: { variant: "success", label: "Success" },
    failure: { variant: "error", label: "Failed" },
    active: { variant: "warning", label: "Active" },
    empty: { variant: "neutral", label: "Empty" },
    unknown: { variant: "neutral", label: "Unknown" },
};

function SessionRow({ session }: { session: SessionSummary }) {
    const statusBadge = SESSION_STATUS_BADGE[session.status ?? "unknown"] ?? SESSION_STATUS_BADGE.unknown;

    return (
        <Link
            href={`/sessions/${encodeURIComponent(session.id)}`}
            className="flex w-full items-center gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-5 py-4 shadow-sm transition-colors hover:border-brand-200"
        >
            <FeatherFolder className="text-heading-3 font-heading-3 text-brand-600 flex-none" />
            <div className="flex min-w-0 grow flex-col gap-1">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-body-bold font-body-bold text-default-font truncate">
                        {session.name || session.id}
                    </span>
                    <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                    <Badge variant="neutral">{session.run_count ?? 0} runs</Badge>
                    {session.user_id ? (
                        <span className="text-caption font-caption text-subtext-color">
                            {session.user_id}
                        </span>
                    ) : null}
                </div>
                {session.name ? (
                    <span className="text-caption font-caption text-subtext-color truncate">
                        {session.id}
                    </span>
                ) : null}
            </div>
            <span className="hidden text-caption font-caption text-subtext-color md:block whitespace-nowrap">
                Updated {relativeTime(session.updated_at)}
            </span>
            <FeatherChevronRight className="text-body font-body text-neutral-400 flex-none" />
        </Link>
    );
}
