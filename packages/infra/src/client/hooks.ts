"use client";

// ---------------------------------------------------------------------------
// @agentq/infra — client-side hooks for infrastructure monitoring
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import type {
    InfraAnalyticsResponse,
    InfraSuggestionsResponse,
    InfraSnapshotResponse,
} from "../types.js";
import {
    fetchInfraAnalytics,
    fetchInfraSnapshot,
    fetchInfraSuggestions,
} from "./api.js";
import type { TimeRange } from "@/src/client/lib/types";

/** Default polling interval for live infrastructure data. */
const INFRA_POLL_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// Infrastructure snapshot
// ---------------------------------------------------------------------------

export interface InfraSnapshotQueryState {
    snapshot: InfraSnapshotResponse | null;
    isLoading: boolean;
    errorMessage: string | null;
}

export function useInfraSnapshot(): InfraSnapshotQueryState {
    const [snapshot, setSnapshot] = useState<InfraSnapshotResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const next = await fetchInfraSnapshot();
                if (cancelled) return;
                setSnapshot(next);
                setErrorMessage(null);
            } catch (error) {
                if (!cancelled) {
                    setErrorMessage(
                        error instanceof Error
                            ? error.message
                            : "Failed to load infrastructure snapshot.",
                    );
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        const intervalId = window.setInterval(load, INFRA_POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, []);

    return { snapshot, isLoading, errorMessage };
}

// ---------------------------------------------------------------------------
// Infrastructure suggestions
// ---------------------------------------------------------------------------

export function useInfraSuggestions(hours = 24) {
    const [data, setData] = useState<InfraSuggestionsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetchInfraSuggestions(hours);
            setData(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load suggestions");
        } finally {
            setLoading(false);
        }
    }, [hours]);

    useEffect(() => {
        load();
    }, [load]);

    return { data, loading, error, refresh: load };
}

// ---------------------------------------------------------------------------
// Infrastructure analytics
// ---------------------------------------------------------------------------

export function useInfraAnalytics(timeRange: TimeRange) {
    const [data, setData] = useState<InfraAnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(true);

    const fromIso = timeRange.from.toISOString();
    const toIso = timeRange.to.toISOString();

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const load = async () => {
            try {
                const result = await fetchInfraAnalytics(fromIso, toIso);
                if (!cancelled) setData(result);
            } catch (err) {
                console.error("[infra-analytics] fetch failed:", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [fromIso, toIso]);

    return { data, loading };
}

// ---------------------------------------------------------------------------
// Queue history (derived from infra snapshot)
// ---------------------------------------------------------------------------

export function useQueueHistory(snapshot: InfraSnapshotResponse | null) {
    const historyRef = useRef<
        {
            time: string;
            active: number;
            reserved: number;
            scheduled: number;
            pending: number;
        }[]
    >([]);

    return useMemo(() => {
        if (!snapshot) return historyRef.current;
        const now = new Date();
        const label = now.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });

        const nextHistory = [
            ...historyRef.current,
            {
                time: label,
                active: snapshot.counts.active_tasks,
                reserved: snapshot.counts.reserved_tasks,
                scheduled: snapshot.counts.scheduled_tasks,
                pending: snapshot.counts.pending_tasks,
            },
        ].slice(-60);

        historyRef.current = nextHistory;
        return nextHistory;
    }, [snapshot]);
}
