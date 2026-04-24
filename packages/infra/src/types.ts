// ---------------------------------------------------------------------------
// Infrastructure monitoring types for AgentQ
// ---------------------------------------------------------------------------

/**
 * Represents a Celery worker as observed through inspection.
 */
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

/**
 * Represents a broker queue (e.g. a Redis list backing a Celery queue).
 */
export interface ObservabilityBrokerQueue {
    name: string;
    pending_count: number;
    priority_buckets: Record<string, number>;
    is_default: boolean;
}

/**
 * A point-in-time snapshot of the task queue infrastructure.
 */
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

// ---------------------------------------------------------------------------
// Infrastructure suggestion types
// ---------------------------------------------------------------------------

/**
 * Categories for infrastructure suggestions.
 */
export type InfraSuggestionCategory =
    | "capacity"
    | "reliability"
    | "performance"
    | "operational";

/**
 * Severity levels for infrastructure suggestions.
 */
export type InfraSuggestionSeverity = "success" | "info" | "warning" | "critical";

/**
 * An individual infrastructure suggestion with optional metric context.
 */
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

/**
 * Response payload for infrastructure suggestions endpoint.
 */
export interface InfraSuggestionsResponse {
    generated_at: string;
    lookback_hours: number;
    suggestions: InfraSuggestion[];
}

// ---------------------------------------------------------------------------
// Infrastructure API response types
// ---------------------------------------------------------------------------

/**
 * Alias for the infrastructure snapshot endpoint response.
 */
export type InfraSnapshotResponse = ObservabilityQueueSnapshot;

/**
 * Response payload for infrastructure analytics endpoint.
 */
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
