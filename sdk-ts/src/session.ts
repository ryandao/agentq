import type { SessionOptions } from "./types.js";
import { runWithSessionContext } from "./context.js";
import { getTracer } from "./tracer.js";
import { AgentQAttributes, SpanType } from "./types.js";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";

/**
 * Run a function within a session context.
 *
 * All spans created within `fn` will automatically inherit the session's
 * ID, run ID, user ID, and metadata. Context propagates through async
 * boundaries via AsyncLocalStorage.
 *
 * @example
 * ```ts
 * await session({ sessionId: "sess_123", userId: "user_abc" }, async () => {
 *   // All spans here get session attributes
 *   await myAgent("hello");
 * });
 * ```
 */
export function session<T>(
  options: SessionOptions,
  fn: () => T | Promise<T>,
): Promise<T> {
  const tracer = getTracer();

  return tracer.startActiveSpan(
    `session.${options.sessionId ?? "anonymous"}`,
    { kind: SpanKind.INTERNAL },
    async (span) => {
      span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.SESSION);

      if (options.sessionId) {
        span.setAttribute(AgentQAttributes.SESSION_ID, options.sessionId);
      }
      if (options.runId) {
        span.setAttribute(AgentQAttributes.RUN_ID, options.runId);
      }
      if (options.userId) {
        span.setAttribute(AgentQAttributes.USER_ID, options.userId);
      }
      if (options.metadata) {
        for (const [key, value] of Object.entries(options.metadata)) {
          span.setAttribute(`${AgentQAttributes.METADATA_PREFIX}${key}`, value);
        }
      }

      try {
        const result = await runWithSessionContext(
          {
            sessionId: options.sessionId,
            runId: options.runId,
            userId: options.userId,
            metadata: options.metadata,
          },
          fn,
        );
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
