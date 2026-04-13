import {
  SpanStatusCode,
  SpanKind,
  type Span,
} from "@opentelemetry/api";
import { getTracer, getActiveSpan } from "./tracer.js";
import { getSessionContext } from "./context.js";
import {
  AgentQAttributes,
  SpanType,
  type TrackLLMOptions,
  type TrackToolOptions,
  type TrackAgentOptions,
  type AgentQSpan,
} from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function applySessionAttributes(span: Span): void {
  const session = getSessionContext();
  if (!session) return;

  if (session.sessionId) {
    span.setAttribute(AgentQAttributes.SESSION_ID, session.sessionId);
  }
  if (session.runId) {
    span.setAttribute(AgentQAttributes.RUN_ID, session.runId);
  }
  if (session.userId) {
    span.setAttribute(AgentQAttributes.USER_ID, session.userId);
  }
  if (session.metadata) {
    for (const [key, value] of Object.entries(session.metadata)) {
      span.setAttribute(`${AgentQAttributes.METADATA_PREFIX}${key}`, value);
    }
  }
}

function wrapSpan(span: Span): AgentQSpan {
  return {
    span,
    setAttribute(key: string, value: string | number | boolean) {
      span.setAttribute(key, value);
    },
    recordError(error: Error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    },
    end() {
      span.end();
    },
  };
}

function safeSerialize(value: unknown): string {
  try {
    return JSON.stringify(value, null, 0);
  } catch {
    return String(value);
  }
}

// ── trackLLM ──────────────────────────────────────────────────────────────

/**
 * Create a span tracking an LLM call.
 *
 * Can be used as:
 * - `trackLLM(options, async (span) => { ... })` — auto-ends span
 * - `const span = trackLLM(options)` — manual span, caller must call `span.end()`
 */
export function trackLLM(options: TrackLLMOptions): AgentQSpan;
export function trackLLM<T>(
  options: TrackLLMOptions,
  fn: (span: AgentQSpan) => Promise<T> | T,
): Promise<T>;
export function trackLLM<T>(
  options: TrackLLMOptions,
  fn?: (span: AgentQSpan) => Promise<T> | T,
): AgentQSpan | Promise<T> {
  const tracer = getTracer();
  const spanName = `llm.${options.provider ?? "unknown"}.${options.model ?? "unknown"}`;

  if (!fn) {
    // Manual mode: return span wrapper
    const span = tracer.startSpan(spanName, { kind: SpanKind.CLIENT });
    span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.LLM);
    if (options.model) span.setAttribute(AgentQAttributes.LLM_MODEL, options.model);
    if (options.provider) span.setAttribute(AgentQAttributes.LLM_SYSTEM, options.provider);
    if (options.temperature !== undefined) span.setAttribute(AgentQAttributes.LLM_TEMPERATURE, options.temperature);
    if (options.maxTokens !== undefined) span.setAttribute(AgentQAttributes.LLM_MAX_TOKENS, options.maxTokens);
    if (options.input !== undefined) span.setAttribute(AgentQAttributes.LLM_INPUT, safeSerialize(options.input));
    applySessionAttributes(span);
    if (options.metadata) {
      for (const [k, v] of Object.entries(options.metadata)) {
        span.setAttribute(`${AgentQAttributes.METADATA_PREFIX}${k}`, v);
      }
    }
    return wrapSpan(span);
  }

  // Auto mode: wrap function execution
  return tracer.startActiveSpan(
    spanName,
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.LLM);
      if (options.model) span.setAttribute(AgentQAttributes.LLM_MODEL, options.model);
      if (options.provider) span.setAttribute(AgentQAttributes.LLM_SYSTEM, options.provider);
      if (options.temperature !== undefined) span.setAttribute(AgentQAttributes.LLM_TEMPERATURE, options.temperature);
      if (options.maxTokens !== undefined) span.setAttribute(AgentQAttributes.LLM_MAX_TOKENS, options.maxTokens);
      if (options.input !== undefined) span.setAttribute(AgentQAttributes.LLM_INPUT, safeSerialize(options.input));
      applySessionAttributes(span);
      if (options.metadata) {
        for (const [k, v] of Object.entries(options.metadata)) {
          span.setAttribute(`${AgentQAttributes.METADATA_PREFIX}${k}`, v);
        }
      }

      const wrapped = wrapSpan(span);
      try {
        const result = await fn(wrapped);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        if (error instanceof Error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        }
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

// ── trackTool ─────────────────────────────────────────────────────────────

/**
 * Create a span tracking a tool call.
 */
export function trackTool(options: TrackToolOptions): AgentQSpan;
export function trackTool<T>(
  options: TrackToolOptions,
  fn: (span: AgentQSpan) => Promise<T> | T,
): Promise<T>;
export function trackTool<T>(
  options: TrackToolOptions,
  fn?: (span: AgentQSpan) => Promise<T> | T,
): AgentQSpan | Promise<T> {
  const tracer = getTracer();
  const spanName = `tool.${options.name}`;

  if (!fn) {
    const span = tracer.startSpan(spanName, { kind: SpanKind.INTERNAL });
    span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.TOOL);
    span.setAttribute(AgentQAttributes.TOOL_NAME, options.name);
    if (options.input !== undefined) span.setAttribute(AgentQAttributes.TOOL_INPUT, safeSerialize(options.input));
    applySessionAttributes(span);
    if (options.metadata) {
      for (const [k, v] of Object.entries(options.metadata)) {
        span.setAttribute(`${AgentQAttributes.METADATA_PREFIX}${k}`, v);
      }
    }
    return wrapSpan(span);
  }

  return tracer.startActiveSpan(
    spanName,
    { kind: SpanKind.INTERNAL },
    async (span) => {
      span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.TOOL);
      span.setAttribute(AgentQAttributes.TOOL_NAME, options.name);
      if (options.input !== undefined) span.setAttribute(AgentQAttributes.TOOL_INPUT, safeSerialize(options.input));
      applySessionAttributes(span);
      if (options.metadata) {
        for (const [k, v] of Object.entries(options.metadata)) {
          span.setAttribute(`${AgentQAttributes.METADATA_PREFIX}${k}`, v);
        }
      }

      const wrapped = wrapSpan(span);
      try {
        const result = await fn(wrapped);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        if (error instanceof Error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        }
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

// ── trackAgent ────────────────────────────────────────────────────────────

/**
 * Create a span tracking an agent invocation.
 */
export function trackAgent(options: TrackAgentOptions): AgentQSpan;
export function trackAgent<T>(
  options: TrackAgentOptions,
  fn: (span: AgentQSpan) => Promise<T> | T,
): Promise<T>;
export function trackAgent<T>(
  options: TrackAgentOptions,
  fn?: (span: AgentQSpan) => Promise<T> | T,
): AgentQSpan | Promise<T> {
  const tracer = getTracer();
  const spanName = `agent.${options.name}`;

  if (!fn) {
    const span = tracer.startSpan(spanName, { kind: SpanKind.INTERNAL });
    span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.AGENT);
    span.setAttribute(AgentQAttributes.AGENT_NAME, options.name);
    if (options.description) span.setAttribute(AgentQAttributes.AGENT_DESCRIPTION, options.description);
    applySessionAttributes(span);
    if (options.metadata) {
      for (const [k, v] of Object.entries(options.metadata)) {
        span.setAttribute(`${AgentQAttributes.METADATA_PREFIX}${k}`, v);
      }
    }
    return wrapSpan(span);
  }

  return tracer.startActiveSpan(
    spanName,
    { kind: SpanKind.INTERNAL },
    async (span) => {
      span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.AGENT);
      span.setAttribute(AgentQAttributes.AGENT_NAME, options.name);
      if (options.description) span.setAttribute(AgentQAttributes.AGENT_DESCRIPTION, options.description);
      applySessionAttributes(span);
      if (options.metadata) {
        for (const [k, v] of Object.entries(options.metadata)) {
          span.setAttribute(`${AgentQAttributes.METADATA_PREFIX}${k}`, v);
        }
      }

      const wrapped = wrapSpan(span);
      try {
        const result = await fn(wrapped);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        if (error instanceof Error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        }
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

// ── currentSpan ───────────────────────────────────────────────────────────

/**
 * Get the current active span for manual enrichment.
 * Returns undefined if no span is active.
 */
export function currentSpan(): AgentQSpan | undefined {
  const span = getActiveSpan();
  if (!span) return undefined;
  return wrapSpan(span);
}
