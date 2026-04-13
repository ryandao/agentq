import type { Span } from "@opentelemetry/api";

// ── Init options ──────────────────────────────────────────────────────────

export interface InitOptions {
  /** AgentQ API key (or set AGENTQ_API_KEY env var) */
  apiKey?: string;
  /** OTLP endpoint URL (default: https://ingest.agentq.dev) */
  endpoint?: string;
  /** Additional OTLP headers */
  headers?: Record<string, string>;
  /** Service / application name */
  serviceName?: string;
  /** Enable console debug output */
  debug?: boolean;
  /** Batch export settings */
  batchConfig?: {
    maxQueueSize?: number;
    maxExportBatchSize?: number;
    scheduledDelayMillis?: number;
    exportTimeoutMillis?: number;
  };
}

// ── Session options ───────────────────────────────────────────────────────

export interface SessionOptions {
  /** Unique session identifier */
  sessionId?: string;
  /** Run identifier (groups multiple sessions) */
  runId?: string;
  /** Arbitrary metadata attached to all spans in this session */
  metadata?: Record<string, string>;
  /** User ID associated with this session */
  userId?: string;
}

// ── Span creation options ─────────────────────────────────────────────────

export interface TrackLLMOptions {
  /** Model name/identifier */
  model?: string;
  /** Provider (openai, anthropic, etc.) */
  provider?: string;
  /** Temperature setting */
  temperature?: number;
  /** Max tokens */
  maxTokens?: number;
  /** Input messages (will be serialized) */
  input?: unknown;
  /** Metadata */
  metadata?: Record<string, string>;
}

export interface TrackToolOptions {
  /** Tool name */
  name: string;
  /** Tool input/arguments */
  input?: unknown;
  /** Metadata */
  metadata?: Record<string, string>;
}

export interface TrackAgentOptions {
  /** Agent name */
  name: string;
  /** Agent description */
  description?: string;
  /** Metadata */
  metadata?: Record<string, string>;
}

// ── Instrument options ────────────────────────────────────────────────────

export interface InstrumentOptions {
  /** Auto-instrument OpenAI SDK */
  openai?: boolean;
  /** Auto-instrument Anthropic SDK */
  anthropic?: boolean;
  /** Auto-instrument Vercel AI SDK */
  vercelAI?: boolean;
}

// ── Semantic attributes ───────────────────────────────────────────────────

export const AgentQAttributes = {
  // Session
  SESSION_ID: "agentq.session.id",
  RUN_ID: "agentq.run.id",
  USER_ID: "agentq.user.id",

  // Agent
  AGENT_NAME: "agentq.agent.name",
  AGENT_DESCRIPTION: "agentq.agent.description",

  // LLM
  LLM_SYSTEM: "gen_ai.system",
  LLM_MODEL: "gen_ai.request.model",
  LLM_TEMPERATURE: "gen_ai.request.temperature",
  LLM_MAX_TOKENS: "gen_ai.request.max_tokens",
  LLM_INPUT: "gen_ai.input",
  LLM_OUTPUT: "gen_ai.output",
  LLM_USAGE_INPUT_TOKENS: "gen_ai.usage.input_tokens",
  LLM_USAGE_OUTPUT_TOKENS: "gen_ai.usage.output_tokens",
  LLM_USAGE_TOTAL_TOKENS: "gen_ai.usage.total_tokens",

  // Tool
  TOOL_NAME: "agentq.tool.name",
  TOOL_INPUT: "agentq.tool.input",
  TOOL_OUTPUT: "agentq.tool.output",

  // Span type
  SPAN_TYPE: "agentq.span.type",

  // Metadata prefix
  METADATA_PREFIX: "agentq.metadata.",
} as const;

export type AgentQAttributeKey =
  (typeof AgentQAttributes)[keyof typeof AgentQAttributes];

// ── Span types ────────────────────────────────────────────────────────────

export enum SpanType {
  AGENT = "agent",
  LLM = "llm",
  TOOL = "tool",
  SESSION = "session",
}

// ── Internal context types ────────────────────────────────────────────────

export interface SessionContext {
  sessionId?: string;
  runId?: string;
  userId?: string;
  metadata?: Record<string, string>;
}

export interface AgentQSpan {
  /** Underlying OpenTelemetry span */
  span: Span;
  /** Set an attribute on this span */
  setAttribute(key: string, value: string | number | boolean): void;
  /** Record an error on this span */
  recordError(error: Error): void;
  /** End this span */
  end(): void;
}
