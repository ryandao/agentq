"use client";

import Link from "next/link";
import {
    FeatherChevronRight,
    FeatherLayers,
    FeatherPlay,
    FeatherServer,
} from "@subframe/core";
import { Badge } from "@/src/ui/components/Badge";
import { useInfraSnapshot, useRuns } from "@/src/client/lib/hooks";
import { relativeTime } from "@/src/client/lib/format";
import { getStatusVariant } from "@/src/client/lib/helpers";
import { getStatusIcon, ErrorBanner, EmptyState, StatCard, SectionCard, LoadingPanel, QueueErrors } from "@/src/client/components/shared";

export function OverviewPageView() {
    const { snapshot, isLoading: infraLoading, errorMessage: infraError } = useInfraSnapshot();
    const { data: runsData, isLoading: runsLoading } = useRuns({ page: 1, pageSize: 5 });

    const recentRuns = runsData?.runs ?? [];
    const workers = snapshot?.workers.slice(0, 4) ?? [];
    const brokerQueues = snapshot?.broker_queues.slice(0, 4) ?? [];
    const errorMessage = infraError;
    const isLoading = infraLoading || runsLoading;

    return (
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8">
            <div className="flex w-full flex-col items-start gap-2">
                <span className="text-heading-1 font-heading-1 text-default-font">Overview</span>
                <span className="text-body font-body text-subtext-color">
                    Monitor the health of runs, workers, and broker queues
                </span>
            </div>
            {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
            <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Active Tasks" value={snapshot?.counts.active_tasks ?? "-"} icon={<FeatherPlay />} variant="success" />
                <StatCard label="Workers" value={snapshot?.counts.workers ?? "-"} icon={<FeatherServer />} variant="brand" />
                <StatCard label="Queues" value={snapshot?.counts.broker_queues ?? "-"} icon={<FeatherLayers />} variant="neutral" />
            </div>
            {isLoading && !snapshot && !runsData ? <LoadingPanel message="Loading overview..." /> : null}
            <div className="grid w-full grid-cols-1 gap-6 xl:grid-cols-3">
                <SectionCard
                    title="Recent Runs"
                    description="Most recent runs across the platform"
                    action={
                        <Link
                            href="/runs"
                            className="flex items-center gap-1 text-caption-bold font-caption-bold text-brand-700 hover:text-brand-800"
                        >
                            View all <FeatherChevronRight className="text-caption font-caption" />
                        </Link>
                    }
                >
                    <div className="flex flex-col gap-3">
                        {recentRuns.length === 0 ? (
                            <EmptyState title="No runs yet" description="Observed runs will appear here once work starts flowing." />
                        ) : (
                            recentRuns.map((run) => (
                                <div
                                    key={run.run_id}
                                    className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-neutral-200"
                                >
                                    <Link
                                        href={`/runs/${run.run_id}`}
                                        className="flex min-w-0 grow items-center gap-3"
                                    >
                                        <Badge variant={getStatusVariant(run.status)} icon={getStatusIcon(run.status)}>
                                            {run.status}
                                        </Badge>
                                        <span className="min-w-0 grow truncate text-body font-body text-default-font">
                                            {run.task_name || run.run_id}
                                        </span>
                                        <span className="flex-none text-caption font-caption text-subtext-color whitespace-nowrap">
                                            {relativeTime(run.started_at)}
                                        </span>
                                    </Link>
                                </div>
                            ))
                        )}
                    </div>
                </SectionCard>
                <SectionCard
                    title="Workers"
                    description="Current worker activity and capacity"
                    action={
                        <Link
                            href="/infrastructure"
                            className="flex items-center gap-1 text-caption-bold font-caption-bold text-brand-700 hover:text-brand-800"
                        >
                            View all <FeatherChevronRight className="text-caption font-caption" />
                        </Link>
                    }
                >
                    <div className="flex flex-col gap-3">
                        {workers.length === 0 ? (
                            <EmptyState title="No live workers" description="Worker details will show up when the queue backend responds." />
                        ) : (
                            workers.map((worker) => (
                                <div key={worker.name} className="flex items-center gap-3 rounded-md bg-neutral-100 px-3 py-3">
                                    <div className="h-2.5 w-2.5 flex-none rounded-full bg-success-500" />
                                    <div className="flex min-w-0 grow flex-col gap-0.5">
                                        <span className="text-body-bold font-body-bold text-default-font truncate">{worker.name}</span>
                                        <span className="text-caption font-caption text-subtext-color">
                                            {worker.active_count} active &middot; {worker.reserved_count} reserved &middot; {worker.scheduled_count} scheduled
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </SectionCard>
                <SectionCard
                    title="Broker Queues"
                    description="Queue depth and routing"
                    action={
                        <Link
                            href="/infrastructure"
                            className="flex items-center gap-1 text-caption-bold font-caption-bold text-brand-700 hover:text-brand-800"
                        >
                            View all <FeatherChevronRight className="text-caption font-caption" />
                        </Link>
                    }
                >
                    <div className="flex flex-col gap-3">
                        <QueueErrors errors={snapshot?.errors ?? []} />
                        {brokerQueues.length === 0 ? (
                            <EmptyState title="No broker queues" description="Queue entries will appear once the broker is reachable." />
                        ) : (
                            brokerQueues.map((queue) => (
                                <div key={queue.name} className="flex items-center justify-between gap-3 rounded-md bg-neutral-100 px-3 py-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-body-bold font-body-bold text-default-font">{queue.name}</span>
                                        {queue.is_default ? <Badge variant="brand">default</Badge> : null}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-body-bold font-body-bold text-default-font">{queue.pending_count}</span>
                                        <span className="text-caption font-caption text-subtext-color">pending</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </SectionCard>
            </div>
        </div>
    );
}
