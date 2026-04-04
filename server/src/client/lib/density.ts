import type { ObservedRunSummary } from "@/src/client/api";
import type { TimeRange } from "./types";

export function getBucketMs(range: TimeRange): number {
    const hours = (range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60);
    if (hours <= 1) return 5 * 60 * 1000;
    if (hours <= 6) return 15 * 60 * 1000;
    if (hours <= 24) return 60 * 60 * 1000;
    if (hours <= 168) return 6 * 60 * 60 * 1000;
    return 24 * 60 * 60 * 1000;
}

function formatBucketLabel(date: Date, range: TimeRange): string {
    const hours = (range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60);
    if (hours <= 24) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (hours <= 168) {
        return date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function buildDensityData(runs: ObservedRunSummary[], range: TimeRange) {
    const bucketMs = getBucketMs(range);
    const fromMs = range.from.getTime();
    const toMs = range.to.getTime();
    const bucketCount = Math.max(1, Math.ceil((toMs - fromMs) / bucketMs));

    const buckets: { time: string; Success: number; Failure: number; Running: number }[] = [];
    for (let i = 0; i < bucketCount; i++) {
        buckets.push({
            time: formatBucketLabel(new Date(fromMs + i * bucketMs), range),
            Success: 0,
            Failure: 0,
            Running: 0,
        });
    }

    runs.forEach((run) => {
        const ts = run.started_at ? new Date(run.started_at).getTime() : null;
        if (!ts || ts < fromMs || ts >= toMs) return;
        const idx = Math.min(Math.floor((ts - fromMs) / bucketMs), bucketCount - 1);
        if (run.status === "SUCCESS") buckets[idx].Success++;
        else if (run.status === "FAILURE" || run.status === "ABORTED") buckets[idx].Failure++;
        else buckets[idx].Running++;
    });

    return buckets;
}
