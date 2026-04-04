import type { ObservedSpan, ObservedRunDetailResponse, ObservedRunSummary } from "@/src/client/api";

export type SpanTreeNode = ObservedSpan & { children: SpanTreeNode[] };

export type TimeRangePreset = "1h" | "6h" | "24h" | "7d" | "30d";

export interface TimeRange {
    from: Date;
    to: Date;
    preset: TimeRangePreset | "custom";
}

export const TIME_RANGE_PRESETS: { value: TimeRangePreset; label: string; ms: number }[] = [
    { value: "1h", label: "1H", ms: 60 * 60 * 1000 },
    { value: "6h", label: "6H", ms: 6 * 60 * 60 * 1000 },
    { value: "24h", label: "24H", ms: 24 * 60 * 60 * 1000 },
    { value: "7d", label: "7D", ms: 7 * 24 * 60 * 60 * 1000 },
    { value: "30d", label: "30D", ms: 30 * 24 * 60 * 60 * 1000 },
];

export interface DetailQueryState {
    detail: ObservedRunDetailResponse | null;
    isLoading: boolean;
    errorMessage: string | null;
}

export interface SessionGroup {
    sessionId: string;
    displaySessionId: string;
    runs: ObservedRunSummary[];
    totalSpans: number;
    activeRuns: number;
    latestTimestamp: string | null;
}

export type RunDetailTab = "steps" | "timeline" | "logs";

export type ChatMessage = { role?: string; content?: unknown; [k: string]: unknown };

export type InfraTab = "overview" | "workers" | "queues" | "monitoring";
