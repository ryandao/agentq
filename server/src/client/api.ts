import {
    AgentDependencyEdge,
    AgentDependencyGraph,
    AgentDetailResponse,
    AgentRunStats,
    AgentSummary,
    AgentsListResponse,
    InfraAnalyticsResponse,
    InfraSuggestion,
    InfraSuggestionCategory,
    InfraSuggestionSeverity,
    InfraSuggestionsResponse,
    InfraSnapshotResponse,
    ObservabilityBrokerQueue,
    ObservabilityQueueSnapshot,
    ObservabilityWorker,
    ObservedEvent,
    ObservedRunDetailResponse,
    ObservedRunSummary,
    ObservedSpan,
    RunSearchFilters,
    RunSearchResponse,
    RunsListResponse,
    RunStatsResponse,
    SessionDetailResponse,
    SessionStatsPayload,
    SessionSummary,
    SessionsListResponse,
    StepNode,
    TokenSummary,
    TokenUsage,
    WaterfallEntry,
} from "@/src/server/contracts";


async function validateResponse(response: Response): Promise<void> {
    if (response.ok) {
        return;
    }

    let error = `Request failed with status ${response.status}`;
    try {
        const body = (await response.json()) as { error?: string };
        if (body.error) {
            error = body.error;
        }
    } catch {
        // Ignore parse failures and keep the generic message.
    }

    throw new Error(error);
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export async function fetchRuns(params: {
    page?: number;
    pageSize?: number;
    from?: string;
    to?: string;
    status?: string[];
    agentName?: string;
    text?: string;
} = {}): Promise<RunsListResponse> {
    const query = new URLSearchParams();
    if (params.page != null) query.set("page", String(params.page));
    if (params.pageSize != null) query.set("pageSize", String(params.pageSize));
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    if (params.status?.length) query.set("status", params.status.join(","));
    if (params.agentName) query.set("agent_name", params.agentName);
    if (params.text) query.set("text", params.text);

    const response = await fetch(`/api/runs?${query}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });
    await validateResponse(response);
    return (await response.json()) as RunsListResponse;
}

export async function fetchRunStats(
    from: string,
    to: string,
): Promise<RunStatsResponse> {
    const params = new URLSearchParams({ from, to });
    const response = await fetch(`/api/runs/stats?${params}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });
    await validateResponse(response);
    return (await response.json()) as RunStatsResponse;
}

export async function fetchObservedRunDetail(
    runId: string,
): Promise<ObservedRunDetailResponse> {
    const response = await fetch(`/api/runs/${runId}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });
    await validateResponse(response);
    return (await response.json()) as ObservedRunDetailResponse;
}

export async function fetchRunSearch(
    query: string,
): Promise<RunSearchResponse> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const response = await fetch("/api/runs/search", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, timezone }),
    });
    await validateResponse(response);
    return (await response.json()) as RunSearchResponse;
}

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

export async function fetchInfraSnapshot(): Promise<InfraSnapshotResponse> {
    const response = await fetch("/api/infrastructure/snapshot", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });
    await validateResponse(response);
    return (await response.json()) as InfraSnapshotResponse;
}

export async function fetchInfraAnalytics(
    from: string,
    to: string,
): Promise<InfraAnalyticsResponse> {
    const params = new URLSearchParams({ from, to });
    const response = await fetch(
        `/api/infrastructure/analytics?${params}`,
        {
            method: "GET",
            credentials: "include",
            cache: "no-store",
        },
    );
    await validateResponse(response);
    return (await response.json()) as InfraAnalyticsResponse;
}

export async function fetchInfraSuggestions(
    hours = 24,
): Promise<InfraSuggestionsResponse> {
    const response = await fetch(
        `/api/infrastructure/suggestions?hours=${hours}`,
        {
            method: "GET",
            credentials: "include",
            cache: "no-store",
        },
    );
    await validateResponse(response);
    return (await response.json()) as InfraSuggestionsResponse;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export async function fetchAgents(): Promise<AgentsListResponse> {
    const response = await fetch("/api/agents", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });
    await validateResponse(response);
    return (await response.json()) as AgentsListResponse;
}

export async function fetchAgentDetail(
    agentName: string,
): Promise<AgentDetailResponse> {
    const response = await fetch(
        `/api/agents/${encodeURIComponent(agentName)}`,
        {
            method: "GET",
            credentials: "include",
            cache: "no-store",
        },
    );
    await validateResponse(response);
    return (await response.json()) as AgentDetailResponse;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface SessionFilterParams {
    status?: string;
    user_id?: string;
    search?: string;
    from?: string;
    to?: string;
}

export async function fetchSessions(
    limit = 100,
    filters?: SessionFilterParams,
): Promise<SessionsListResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (filters?.status) params.set("status", filters.status);
    if (filters?.user_id) params.set("user_id", filters.user_id);
    if (filters?.search) params.set("search", filters.search);
    if (filters?.from) params.set("from", filters.from);
    if (filters?.to) params.set("to", filters.to);

    const response = await fetch(`/api/sessions?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });
    await validateResponse(response);
    return (await response.json()) as SessionsListResponse;
}

export async function fetchSessionDetail(
    sessionId: string,
): Promise<SessionDetailResponse> {
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });
    await validateResponse(response);
    return (await response.json()) as SessionDetailResponse;
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
    AgentDependencyEdge,
    AgentDependencyGraph,
    AgentDetailResponse,
    AgentRunStats,
    AgentSummary,
    AgentsListResponse,
    InfraAnalyticsResponse,
    InfraSuggestion,
    InfraSuggestionCategory,
    InfraSuggestionSeverity,
    InfraSuggestionsResponse,
    InfraSnapshotResponse,
    ObservabilityBrokerQueue,
    ObservabilityQueueSnapshot,
    ObservabilityWorker,
    ObservedEvent,
    ObservedRunDetailResponse,
    ObservedRunSummary,
    ObservedSpan,
    RunSearchFilters,
    RunSearchResponse,
    RunsListResponse,
    RunStatsResponse,
    SessionDetailResponse,
    SessionStatsPayload,
    SessionSummary,
    SessionsListResponse,
    StepNode,
    TokenSummary,
    TokenUsage,
    WaterfallEntry,
};
