/**
 * Core type definitions for the AgentQ TypeScript SDK.
 */

/** Supported agent framework types. */
export type AgentFramework =
  | "langchain"
  | "crewai"
  | "autogen"
  | "openai"
  | "anthropic"
  | "custom";

/** Agent status in the AgentQ platform. */
export type AgentStatus = "active" | "inactive" | "error" | "pending";

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
  status: "pending" | "running" | "completed" | "failed";
  /** ISO 8601 timestamp of task creation. */
  createdAt: string;
  /** ISO 8601 timestamp of task completion. */
  completedAt?: string;
}
