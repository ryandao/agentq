/**
 * Core type definitions for the AgentQ TypeScript SDK.
 */

// ── Constants ──────────────────────────────────────────────────────────

/** All supported agent framework identifiers. */
export const AGENT_FRAMEWORKS = [
  "langchain",
  "crewai",
  "autogen",
  "openai",
  "anthropic",
  "custom",
] as const;

/** All supported agent status values. */
export const AGENT_STATUSES = [
  "active",
  "inactive",
  "error",
  "pending",
] as const;

/** All supported task status values. */
export const TASK_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;

// ── Core Types ─────────────────────────────────────────────────────────

/** Supported agent framework types. */
export type AgentFramework = (typeof AGENT_FRAMEWORKS)[number];

/** Agent status in the AgentQ platform. */
export type AgentStatus = (typeof AGENT_STATUSES)[number];

/** Task status. */
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Configuration for connecting to the AgentQ server. */
export interface AgentQConfig {
  /** Base URL of the AgentQ server. */
  baseUrl: string;
  /** API key for authentication. */
  apiKey: string;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
  /** Additional headers to include with every request. */
  headers?: Record<string, string>;
  /** Retry configuration. If omitted, retries are disabled. */
  retry?: RetryConfig;
}

/** Configuration for automatic request retries. */
export interface RetryConfig {
  /** Maximum number of retry attempts. Defaults to 3. */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Defaults to 1000. */
  baseDelay?: number;
  /** Maximum delay in ms between retries. Defaults to 30000. */
  maxDelay?: number;
  /** HTTP status codes that should trigger a retry. Defaults to [429, 500, 502, 503, 504]. */
  retryableStatuses?: number[];
}

/** Metadata describing an agent's capabilities and configuration. */
export interface AgentMetadata {
  /** Human-readable name for the agent. */
  name: string;
  /** Description of what the agent does. */
  description?: string;
  /** Version string (semver recommended). */
  version?: string;
  /** The framework this agent is built with. */
  framework?: AgentFramework;
  /** Capabilities or skills the agent possesses. */
  capabilities?: string[];
  /** Custom tags for categorization. */
  tags?: Record<string, string>;
}

/** Options for the @agent decorator. */
export interface AgentDecoratorOptions {
  /** Agent name. If omitted, the class name is used. */
  name?: string;
  /** Agent description. */
  description?: string;
  /** Agent version. */
  version?: string;
  /** The framework this agent is built with. */
  framework?: AgentFramework;
  /** Capabilities or skills the agent possesses. */
  capabilities?: string[];
  /** Whether to auto-register on instantiation. Defaults to true. */
  autoRegister?: boolean;
}

/** Represents a registered agent on the AgentQ platform. */
export interface Agent {
  /** Unique identifier assigned by AgentQ. */
  id: string;
  /** Agent name. */
  name: string;
  /** Agent description. */
  description?: string;
  /** Agent version. */
  version?: string;
  /** The framework this agent is built with. */
  framework?: AgentFramework;
  /** Current agent status. */
  status: AgentStatus;
  /** Capabilities the agent has. */
  capabilities: string[];
  /** Custom tags. */
  tags: Record<string, string>;
  /** ISO 8601 timestamp of when the agent was registered. */
  createdAt: string;
  /** ISO 8601 timestamp of the last update. */
  updatedAt: string;
}

/** Request payload for registering a new agent. */
export interface RegisterAgentRequest {
  name: string;
  description?: string;
  version?: string;
  framework?: AgentFramework;
  capabilities?: string[];
  tags?: Record<string, string>;
}

/** Request payload for updating an existing agent. */
export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  version?: string;
  framework?: AgentFramework;
  status?: AgentStatus;
  capabilities?: string[];
  tags?: Record<string, string>;
}

/** Paginated list response. */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Query parameters for listing agents. */
export interface ListAgentsParams {
  /** Page number (1-based). */
  page?: number;
  /** Number of items per page. */
  pageSize?: number;
  /** Filter by status. */
  status?: AgentStatus;
  /** Filter by framework. */
  framework?: AgentFramework;
  /** Search by name (partial match). */
  search?: string;
}

/** Heartbeat payload sent to keep agent alive. */
export interface HeartbeatPayload {
  /** Agent ID. */
  agentId: string;
  /** Current agent status. */
  status: AgentStatus;
  /** Optional metadata to include with the heartbeat. */
  metadata?: Record<string, unknown>;
}

/** API error response from the AgentQ server. */
export interface ApiError {
  /** HTTP status code. */
  statusCode: number;
  /** Error message. */
  message: string;
  /** Error code for programmatic handling. */
  code?: string;
  /** Additional error details. */
  details?: Record<string, unknown>;
}

/** Task assigned to an agent. */
export interface AgentTask {
  /** Unique task identifier. */
  id: string;
  /** ID of the agent the task is assigned to. */
  agentId: string;
  /** Task description or instruction. */
  input: string;
  /** Task output/result, if completed. */
  output?: string;
  /** Task status. */
  status: TaskStatus;
  /** ISO 8601 timestamp of task creation. */
  createdAt: string;
  /** ISO 8601 timestamp of task completion. */
  completedAt?: string;
}

// ── Registry Event Types ───────────────────────────────────────────────

/** Events emitted by the AgentRegistry. */
export interface RegistryEvents {
  /** Fired when an agent is registered locally. */
  registered: AgentMetadata;
  /** Fired when an agent is unregistered locally. */
  unregistered: string;
  /** Fired when agents are synced with the platform. */
  synced: Agent[];
}

/** Listener function for registry events. */
export type RegistryEventListener<K extends keyof RegistryEvents> = (
  data: RegistryEvents[K]
) => void;

// ── Type Guards ────────────────────────────────────────────────────────

/** Check if a value is a valid AgentFramework. */
export function isAgentFramework(value: unknown): value is AgentFramework {
  return (
    typeof value === "string" &&
    AGENT_FRAMEWORKS.includes(value as AgentFramework)
  );
}

/** Check if a value is a valid AgentStatus. */
export function isAgentStatus(value: unknown): value is AgentStatus {
  return (
    typeof value === "string" && AGENT_STATUSES.includes(value as AgentStatus)
  );
}

/** Check if a value is a valid TaskStatus. */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" && TASK_STATUSES.includes(value as TaskStatus)
  );
}

/**
 * Check if a value looks like an Agent object from the API.
 * Performs structural validation of the shape.
 */
export function isAgent(value: unknown): value is Agent {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    typeof obj["name"] === "string" &&
    isAgentStatus(obj["status"]) &&
    Array.isArray(obj["capabilities"]) &&
    typeof obj["createdAt"] === "string" &&
    typeof obj["updatedAt"] === "string"
  );
}
