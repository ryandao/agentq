// ---------------------------------------------------------------------------
// Infrastructure types — canonical definitions live in @agentq/infra.
// Re-exported here for backward compatibility.
// ---------------------------------------------------------------------------
export type {
    ObservabilityWorker,
    ObservabilityBrokerQueue,
    ObservabilityQueueSnapshot,
    InfraSuggestionCategory,
    InfraSuggestionSeverity,
    InfraSuggestion,
    InfraSuggestionsResponse,
    InfraSnapshotResponse,
    InfraAnalyticsResponse,
} from "@agentq/infra";

// Local import for use within this file
import type { ObservabilityQueueSnapshot } from "@agentq/infra";

export interface AgentSummary {
    id: string;
    name: string;
    description?: string | null;
    version?: string | null;
    metadata?: Record<string, unknown> | null;
    registered_at: string;
    updated_at: string;
    total_spans?: number;
}

export interface SessionSummary {
    id: string;
    name?: string | null;
    summary?: string | null;
    user_id?: string | null;
    user_data?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
    started_at: string;
    updated_at: string;
    run_count?: number;
    status?: string | null;
    latest_run_status?: string | null;
}

export interface ObservedRunSummary {
    run_id: string;
    session_id?: string | null;
    task_name?: string | null;
    queue_name?: string | null;
    worker_name?: string | null;
    status: string;
    error?: string | null;
    input_preview?: unknown;
    output_preview?: unknown;
    latest_span_name?: string | null;
    latest_span_type?: string | null;
    latest_event?: string | null;
    root_span_id?: string | null;
    total_spans: number;
    active_span_count: number;
    enqueued_at?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    total_tokens?: number;
    models?: string[];
    summary?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
}

export interface ObservedSpan {
    span_id: string;
    parent_span_id?: string | null;
    agent_name?: string | null;
    name: string;
    run_type: string;
    status: string;
    started_at?: string | null;
    finished_at?: string | null;
    input_preview?: unknown;
    output_preview?: unknown;
    error?: string | null;
    metadata?: Record<string, unknown> | null;
    tags?: string[];
}

export interface ObservedEvent {
    id: string;
    span_id?: string | null;
    run_id: string;
    type: string;
    name?: string | null;
    message?: string | null;
    level?: string | null;
    data?: Record<string, unknown> | null;
    timestamp: string;
}

export interface RelatedRunTimelineStep {
    step_id: string;
    type: string;
    timestamp: string | null;
    content: string;
}

export interface RelatedRunPayload {
    run_id: string;
    session_id?: string | null;
    status: string;
    timeline: RelatedRunTimelineStep[];
}

// ---------------------------------------------------------------------------
// Run list / stats types
// ---------------------------------------------------------------------------

export interface RunsListResponse {
    runs: ObservedRunSummary[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface RunStatsBucket {
    time: string;
    total: number;
    success: number;
    failed: number;
    running: number;
}

export interface RunStatsResponse {
    buckets: RunStatsBucket[];
    totals: {
        runs: number;
        running: number;
        failed: number;
        tokens: number;
    };
}

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

export interface SessionsListResponse {
    sessions: SessionSummary[];
}

export interface SessionStatsPayload {
    total_duration_ms: number | null;
    total_tokens: number;
    total_spans: number;
    success_count: number;
    failure_count: number;
}

export interface SessionDetailResponse {
    session: SessionSummary;
    runs: ObservedRunSummary[];
    stats: SessionStatsPayload;
}

// ---------------------------------------------------------------------------
// Run search / filter types
// ---------------------------------------------------------------------------

export interface RunSearchFilters {
    status?: string[];
    agent_name?: string;
    date_from?: string;
    date_to?: string;
    min_tokens?: number;
    max_tokens?: number;
    min_duration_ms?: number;
    max_duration_ms?: number;
    text?: string;
}

export interface RunSearchResponse {
    filters: RunSearchFilters;
    results: RunsListResponse;
}

// ---------------------------------------------------------------------------
// Structured run detail types
// ---------------------------------------------------------------------------

export interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

export interface TokenSummary {
    total: TokenUsage;
    by_model: Record<string, TokenUsage>;
}

export interface WaterfallEntry {
    span_id: string;
    parent_span_id?: string | null;
    name: string;
    run_type: string;
    status: string;
    start_ms: number;
    duration_ms: number;
    depth: number;
}

export interface StepNode {
    span: ObservedSpan;
    events: ObservedEvent[];
    children: StepNode[];
}

export interface ObservedRunDetailResponse {
    run: ObservedRunSummary;
    spans: ObservedSpan[];
    events: ObservedEvent[];
    related_run: RelatedRunPayload | null;
    queue: ObservabilityQueueSnapshot;
    steps: StepNode[];
    waterfall: WaterfallEntry[];
    token_summary: TokenSummary;
    logs: ObservedEvent[];
}

// ---------------------------------------------------------------------------
// Agent analytics types
// ---------------------------------------------------------------------------

export interface AgentRunStats {
    agent_name: string;
    total_runs: number;
    success_count: number;
    failure_count: number;
    avg_duration_ms: number | null;
    total_tokens: number;
}

export interface AgentDependencyEdge {
    source: string;
    target: string;
    target_type: "agent" | "tool" | "llm";
    call_count: number;
}

export interface AgentDependencyGraph {
    edges: AgentDependencyEdge[];
}

export interface AgentsListResponse {
    agents: AgentSummary[];
    agent_run_stats: AgentRunStats[];
    dependency_graph: AgentDependencyGraph;
}

export interface AgentHourlyBucket {
    hour: string;
    success_count: number;
    failure_count: number;
    total_tokens: number;
    avg_duration_ms: number | null;
}

export interface AgentDetailResponse {
    agent: AgentSummary;
    run_stats: {
        total: number;
        success: number;
        failure: number;
        running: number;
        pending: number;
    };
    duration_stats: {
        avg_ms: number;
        p50_ms: number;
        p95_ms: number;
    } | null;
    token_stats: {
        total_tokens: number;
        by_model: Record<string, number>;
    };
    hourly: AgentHourlyBucket[];
    recent_runs: ObservedRunSummary[];
    error_patterns: { error_prefix: string; count: number }[];
    dependency_graph: AgentDependencyGraph;
}

