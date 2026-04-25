"use client";

import { useCallback, useEffect, useState } from "react";
import {
    AgentDetailResponse,
    AgentsListResponse,
    ObservedRunDetailResponse,
    RunsListResponse,
    RunStatsResponse,
    SessionDetailResponse,
    SessionsListResponse,
    fetchAgentDetail,
    fetchAgents,
    fetchObservedRunDetail,
    fetchRuns,
    fetchRunStats,
    fetchSessionDetail,
    fetchSessions,
} from "@/src/client/api";
import type { SessionFilterParams } from "@/src/client/api";
import { POLL_INTERVAL_MS } from "./constants";
import type { DetailQueryState, TimeRange } from "./types";

// ---------------------------------------------------------------------------
// Runs (paginated)
// ---------------------------------------------------------------------------

export interface RunsQueryState {
    data: RunsListResponse | null;
    isLoading: boolean;
    errorMessage: string | null;
}

export function useRuns(params: {
    page?: number;
    pageSize?: number;
    from?: string;
    to?: string;
    status?: string[];
    agentName?: string;
    text?: string;
}): RunsQueryState {
    const [data, setData] = useState<RunsListResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const paramsKey = JSON.stringify(params);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const next = await fetchRuns(params);
                if (cancelled) return;
                setData(next);
                setErrorMessage(null);
            } catch (error) {
                if (!cancelled) {
                    setErrorMessage(
                        error instanceof Error ? error.message : "Failed to load runs.",
                    );
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        setIsLoading(true);
        load();
        const intervalId = window.setInterval(load, POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paramsKey]);

    return { data, isLoading, errorMessage };
}

// ---------------------------------------------------------------------------
// Run stats (for charts)
// ---------------------------------------------------------------------------

export interface RunStatsQueryState {
    data: RunStatsResponse | null;
    isLoading: boolean;
    errorMessage: string | null;
}

export function useRunStats(timeRange: TimeRange): RunStatsQueryState {
    const [data, setData] = useState<RunStatsResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const fromIso = timeRange.from.toISOString();
    const toIso = timeRange.to.toISOString();

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const next = await fetchRunStats(fromIso, toIso);
                if (cancelled) return;
                setData(next);
                setErrorMessage(null);
            } catch (error) {
                if (!cancelled) {
                    setErrorMessage(
                        error instanceof Error ? error.message : "Failed to load run stats.",
                    );
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        setIsLoading(true);
        load();
        const intervalId = window.setInterval(load, POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [fromIso, toIso]);

    return { data, isLoading, errorMessage };
}

// ---------------------------------------------------------------------------
// Run detail
// ---------------------------------------------------------------------------

export function useObservedRunDetail(runId: string): DetailQueryState {
    const [detail, setDetail] = useState<ObservedRunDetailResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const loadDetail = async () => {
            try {
                const next = await fetchObservedRunDetail(runId);
                if (cancelled) return;
                setDetail(next);
                setErrorMessage(null);
            } catch (error) {
                if (!cancelled) {
                    setErrorMessage(
                        error instanceof Error
                            ? error.message
                            : "Failed to load run detail.",
                    );
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        loadDetail();
        const intervalId = window.setInterval(loadDetail, POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [runId]);

    return { detail, isLoading, errorMessage };
}

// ---------------------------------------------------------------------------
// Infrastructure — re-exported from @agentq/infra/client
// ---------------------------------------------------------------------------

export {
    useInfraSnapshot,
    useInfraSuggestions,
    useInfraAnalytics,
    useQueueHistory,
} from "@agentq/infra/client";
export type { InfraSnapshotQueryState } from "@agentq/infra/client";

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function useSessions(limit = 100, filters?: SessionFilterParams) {
    const [data, setData] = useState<SessionsListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const filterKey = JSON.stringify(filters ?? {});

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const load = async () => {
            try {
                const result = await fetchSessions(limit, filters);
                if (!cancelled) {
                    setData(result);
                    setError(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load sessions");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        const id = setInterval(load, POLL_INTERVAL_MS);
        return () => { cancelled = true; clearInterval(id); };
    }, [limit, filterKey]);

    return { data, loading, error };
}

// ---------------------------------------------------------------------------
// Session Detail
// ---------------------------------------------------------------------------

export function useSessionDetail(sessionId: string) {
    const [data, setData] = useState<SessionDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const result = await fetchSessionDetail(sessionId);
                if (!cancelled) {
                    setData(result);
                    setError(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load session");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        const id = setInterval(load, POLL_INTERVAL_MS);
        return () => { cancelled = true; clearInterval(id); };
    }, [sessionId]);

    return { data, loading, error };
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export function useAgentsData() {
    const [data, setData] = useState<AgentsListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const result = await fetchAgents();
            setData(result);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load agents");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [refresh]);

    return { data, loading, error };
}

export function useAgentDetail(agentName: string) {
    const [detail, setDetail] = useState<AgentDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const data = await fetchAgentDetail(agentName);
            setDetail(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load agent detail");
        } finally {
            setLoading(false);
        }
    }, [agentName]);

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [refresh]);

    return { detail, loading, error };
}
