export interface ObservabilityWorker {
    name: string;
    active_count: number;
    reserved_count: number;
    scheduled_count: number;
    queues: string[];
    pool?: Record<string, unknown>;
    total?: Record<string, unknown>;
    broker?: string | null;
    pid?: number | null;
    uptime?: number | null;
}

export interface ObservabilityBrokerQueue {
    name: string;
    pending_count: number;
    priority_buckets: Record<string, number>;
    is_default: boolean;
}

export interface ObservabilityQueueSnapshot {
    counts: {
        workers: number;
        active_tasks: number;
        reserved_tasks: number;
        scheduled_tasks: number;
        pending_tasks: number;
        broker_queues: number;
    };
    workers: ObservabilityWorker[];
    broker_queues: ObservabilityBrokerQueue[];
    errors: string[];
}

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

export type InfraSnapshotResponse = ObservabilityQueueSnapshot;

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
// Infrastructure suggestion types
// ---------------------------------------------------------------------------

export type InfraSuggestionCategory =
    | "capacity"
    | "reliability"
    | "performance"
    | "operational";

export type InfraSuggestionSeverity = "success" | "info" | "warning" | "critical";

export interface InfraSuggestion {
    severity: InfraSuggestionSeverity;
    category: InfraSuggestionCategory;
    title: string;
    detail: string;
    action: string;
    metric_context?: {
        label: string;
        current: number;
        historical_avg: number;
        unit: string;
    };
}

export interface InfraSuggestionsResponse {
    generated_at: string;
    lookback_hours: number;
    suggestions: InfraSuggestion[];
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

export interface InfraAnalyticsResponse {
    hourly_throughput: { hour: string; count: number; failure_count: number }[];
    queue_throughput: { queue_name: string; count: number; failure_count: number }[];
    worker_throughput: { worker_name: string; count: number; failure_count: number }[];
    hourly_worker_throughput: { hour: string; dimension: string; count: number }[];
    hourly_queue_throughput: { hour: string; dimension: string; count: number }[];
    run_stats: { status: string; count: number }[];
    queue_wait_stats: { task_name: string; avg_ms: number; p50_ms: number; p95_ms: number; count: number }[];
    lookback_hours: number;
}
