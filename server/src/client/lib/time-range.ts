import type { ObservedRunSummary } from "@/src/client/api";
import type { TimeRange, TimeRangePreset } from "./types";
import { TIME_RANGE_PRESETS } from "./types";

export function makeTimeRange(preset: TimeRangePreset): TimeRange {
    const now = new Date();
    const ms = TIME_RANGE_PRESETS.find((p) => p.value === preset)!.ms;
    return { from: new Date(now.getTime() - ms), to: now, preset };
}

export function deriveTimeRange(runs: ObservedRunSummary[]): TimeRange | null {
    if (runs.length === 0) return null;
    let minMs = Infinity;
    let maxMs = -Infinity;
    for (const run of runs) {
        const ts = run.started_at ? new Date(run.started_at).getTime() : null;
        if (ts && Number.isFinite(ts)) {
            if (ts < minMs) minMs = ts;
            if (ts > maxMs) maxMs = ts;
        }
    }
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return null;
    const padding = Math.max((maxMs - minMs) * 0.05, 5 * 60 * 1000);
    return {
        from: new Date(minMs - padding),
        to: new Date(maxMs + padding),
        preset: "custom",
    };
}
