import {
  SpanStatusCode,
  SpanKind,
} from "@opentelemetry/api";
import { getTracer } from "./tracer.js";
import { getSessionContext } from "./context.js";
import { AgentQAttributes, SpanType } from "./types.js";

// ── agent() HOF ───────────────────────────────────────────────────────────

type AsyncFunction<TArgs extends unknown[], TReturn> = (
  ...args: TArgs
) => Promise<TReturn>;

/**
 * Higher-order function that wraps a function to create an agent span.
 *
 * @example
 * ```ts
 * const myAgent = agent("researcher", async (query: string) => {
 *   // ... agent logic
 *   return result;
 * });
 *
 * const result = await myAgent("What is quantum computing?");
 * ```
 */
export function agent<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => Promise<TReturn>,
): AsyncFunction<TArgs, TReturn>;
export function agent<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => TReturn,
): AsyncFunction<TArgs, TReturn>;
export function agent<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
): AsyncFunction<TArgs, TReturn> {
  const wrappedFn = async (...args: TArgs): Promise<TReturn> => {
    const tracer = getTracer();
    return tracer.startActiveSpan(
      `agent.${name}`,
      { kind: SpanKind.INTERNAL },
      async (span) => {
        span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.AGENT);
        span.setAttribute(AgentQAttributes.AGENT_NAME, name);

        // Apply session context
        const session = getSessionContext();
        if (session) {
          if (session.sessionId) span.setAttribute(AgentQAttributes.SESSION_ID, session.sessionId);
          if (session.runId) span.setAttribute(AgentQAttributes.RUN_ID, session.runId);
          if (session.userId) span.setAttribute(AgentQAttributes.USER_ID, session.userId);
          if (session.metadata) {
            for (const [key, value] of Object.entries(session.metadata)) {
              span.setAttribute(`${AgentQAttributes.METADATA_PREFIX}${key}`, value);
            }
          }
        }

        try {
          const result = await fn(...args);
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
  };

  // Preserve function name for debugging
  Object.defineProperty(wrappedFn, "name", { value: `agent:${name}` });
  return wrappedFn;
}

// ── @Agent decorator ──────────────────────────────────────────────────────

/**
 * Method decorator that wraps a class method to create an agent span.
 *
 * @example
 * ```ts
 * class MyAgents {
 *   @Agent("researcher")
 *   async research(query: string) {
 *     // ... agent logic
 *   }
 * }
 * ```
 */
export function Agent(name?: string): MethodDecorator {
  return function (
    _target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    const agentName = name ?? String(propertyKey);

    descriptor.value = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      const tracer = getTracer();
      return tracer.startActiveSpan(
        `agent.${agentName}`,
        { kind: SpanKind.INTERNAL },
        async (span) => {
          span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.AGENT);
          span.setAttribute(AgentQAttributes.AGENT_NAME, agentName);

          const session = getSessionContext();
          if (session) {
            if (session.sessionId) span.setAttribute(AgentQAttributes.SESSION_ID, session.sessionId);
            if (session.runId) span.setAttribute(AgentQAttributes.RUN_ID, session.runId);
            if (session.userId) span.setAttribute(AgentQAttributes.USER_ID, session.userId);
            if (session.metadata) {
              for (const [key, value] of Object.entries(session.metadata)) {
                span.setAttribute(`${AgentQAttributes.METADATA_PREFIX}${key}`, value);
              }
            }
          }

          try {
            const result = await originalMethod.apply(this, args);
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
    };

    return descriptor;
  };
}
