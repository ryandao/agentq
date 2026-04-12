/**
 * Core type definitions for the AgentQ TypeScript SDK.
 *
 * Mirrors the Python SDK's type system with TypeScript idioms:
 * - String literal unions instead of Enum classes
 * - Readonly interfaces instead of frozen dataclasses
 * - Discriminated unions for event payloads
 */

// ---------------------------------------------------------------------------
// Frameworks
// ---------------------------------------------------------------------------

/** Supported agent frameworks. */
export const Framework = {
  LANGCHAIN: "langchain",
  CREWAI: "crewai",
  AUTOGEN: "autogen",
  LLAMAINDEX: "llamaindex",
} as const;

export type Framework = (typeof Framework)[keyof typeof Framework];

/** All supported framework values as an array (useful for iteration). */
export const FRAMEWORKS: readonly Framework[] = Object.values(Framework);

// ---------------------------------------------------------------------------
// Agent Events
// ---------------------------------------------------------------------------

/** Lifecycle events emitted during agent execution. */
export const AgentEvent = {
  AGENT_START: "agent_start",
  AGENT_END: "agent_end",
  AGENT_ERROR: "agent_error",
  STEP_START: "step_start",
  STEP_END: "step_end",
  TOOL_CALL: "tool_call",
  TOOL_RESULT: "tool_result",
  LLM_START: "llm_start",
  LLM_END: "llm_end",
} as const;

export type AgentEvent = (typeof AgentEvent)[keyof typeof AgentEvent];

// ---------------------------------------------------------------------------
// Event Payload
// ---------------------------------------------------------------------------

/** Payload attached to agent lifecycle events. */
export interface EventPayload {
  readonly event: AgentEvent;
  readonly agentId: string;
  readonly runId: string;
  readonly timestamp: number;
  readonly data: Record<string, unknown>;
  readonly parentRunId?: string;
}

/** Callback type for event handlers. */
export type EventHandler = (payload: EventPayload) => void;

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Result of framework detection. */
export interface DetectionResult {
  readonly framework: Framework;
  readonly installed: boolean;
  readonly version?: string;
  readonly active: boolean;
  readonly entryClasses: readonly string[];
}

// ---------------------------------------------------------------------------
// Framework specification used by the detector
// ---------------------------------------------------------------------------

/** Internal specification for detecting a framework in Node.js. */
export interface FrameworkSpec {
  /** npm package name to attempt requiring. */
  readonly packageName: string;
  /** Additional package names to check for activity. */
  readonly agentPackages: readonly string[];
  /** Known class/export names that indicate active usage. */
  readonly agentExports: readonly string[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration options for the AgentQ client. */
export interface AgentQConfig {
  /** Custom API endpoint. Defaults to process.env.AGENTQ_API_URL or localhost. */
  apiUrl?: string;
  /** API key for authentication. Defaults to process.env.AGENTQ_API_KEY. */
  apiKey?: string;
  /** Frameworks to auto-detect. Defaults to all. */
  frameworks?: readonly Framework[];
  /** Whether to automatically patch detected frameworks. Defaults to true. */
  autoPatch?: boolean;
  /** Custom event handler called for every lifecycle event. */
  onEvent?: EventHandler;
  /** Enable debug logging. Defaults to false. */
  debug?: boolean;
}

// ---------------------------------------------------------------------------
// Agent wrapper
// ---------------------------------------------------------------------------

/** Metadata for a wrapped agent. */
export interface AgentMeta {
  readonly id: string;
  readonly framework: Framework;
  readonly name?: string;
  readonly tags?: readonly string[];
}
