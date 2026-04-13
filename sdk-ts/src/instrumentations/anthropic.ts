import {
  SpanKind,
  SpanStatusCode,
} from "@opentelemetry/api";
import { getTracer } from "../tracer.js";
import { getSessionContext } from "../context.js";
import { AgentQAttributes, SpanType } from "../types.js";

/**
 * Patch the Anthropic Node SDK to automatically create spans for API calls.
 *
 * Instruments:
 *  - `anthropic.messages.create()`
 *  - `anthropic.completions.create()` (legacy)
 */
export function patchAnthropic(): boolean {
  let AnthropicModule: unknown;
  try {
    AnthropicModule = require("@anthropic-ai/sdk");
  } catch {
    return false;
  }

  const AnthropicClass =
    (AnthropicModule as { default?: unknown })?.default ??
    (AnthropicModule as { Anthropic?: unknown })?.Anthropic ??
    AnthropicModule;

  if (!AnthropicClass || typeof AnthropicClass !== "function") {
    return false;
  }

  const OriginalConstructor = AnthropicClass as new (
    ...args: unknown[]
  ) => Record<string, unknown>;

  const moduleExports = AnthropicModule as Record<string, unknown>;

  function applySessionToSpan(
    span: import("@opentelemetry/api").Span,
  ): void {
    const session = getSessionContext();
    if (!session) return;
    if (session.sessionId)
      span.setAttribute(AgentQAttributes.SESSION_ID, session.sessionId);
    if (session.runId)
      span.setAttribute(AgentQAttributes.RUN_ID, session.runId);
    if (session.userId)
      span.setAttribute(AgentQAttributes.USER_ID, session.userId);
    if (session.metadata) {
      for (const [key, value] of Object.entries(session.metadata)) {
        span.setAttribute(
          `${AgentQAttributes.METADATA_PREFIX}${key}`,
          value,
        );
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function patchMessagesCreate(messagesObj: any): void {
    if (!messagesObj || typeof messagesObj.create !== "function") return;
    if (messagesObj.__agentq_patched) return;

    const originalCreate = messagesObj.create.bind(messagesObj);

    messagesObj.create = async function patchedMessagesCreate(
      params: Record<string, unknown>,
      options?: unknown,
    ): Promise<unknown> {
      const tracer = getTracer();
      const model = (params?.model as string) ?? "unknown";
      const spanName = `llm.anthropic.${model}`;

      return tracer.startActiveSpan(
        spanName,
        { kind: SpanKind.CLIENT },
        async (span) => {
          span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.LLM);
          span.setAttribute(AgentQAttributes.LLM_SYSTEM, "anthropic");
          span.setAttribute(AgentQAttributes.LLM_MODEL, model);

          if (params?.temperature !== undefined) {
            span.setAttribute(
              AgentQAttributes.LLM_TEMPERATURE,
              params.temperature as number,
            );
          }
          if (params?.max_tokens !== undefined) {
            span.setAttribute(
              AgentQAttributes.LLM_MAX_TOKENS,
              params.max_tokens as number,
            );
          }

          // Capture input messages
          try {
            const messages = params?.messages;
            if (messages) {
              span.setAttribute(
                AgentQAttributes.LLM_INPUT,
                JSON.stringify(messages),
              );
            }
            // Also capture system prompt if present
            if (params?.system) {
              span.setAttribute(
                "gen_ai.system_prompt",
                typeof params.system === "string"
                  ? params.system
                  : JSON.stringify(params.system),
              );
            }
          } catch {
            // Ignore serialization errors
          }

          applySessionToSpan(span);

          try {
            const result = await originalCreate(params, options);

            // Extract usage from Anthropic response
            const response = result as Record<string, unknown>;
            const usage = response?.usage as
              | Record<string, number>
              | undefined;
            if (usage) {
              if (usage.input_tokens !== undefined) {
                span.setAttribute(
                  AgentQAttributes.LLM_USAGE_INPUT_TOKENS,
                  usage.input_tokens,
                );
              }
              if (usage.output_tokens !== undefined) {
                span.setAttribute(
                  AgentQAttributes.LLM_USAGE_OUTPUT_TOKENS,
                  usage.output_tokens,
                );
              }
              // Anthropic doesn't return total_tokens, compute it
              if (
                usage.input_tokens !== undefined &&
                usage.output_tokens !== undefined
              ) {
                span.setAttribute(
                  AgentQAttributes.LLM_USAGE_TOTAL_TOKENS,
                  usage.input_tokens + usage.output_tokens,
                );
              }
            }

            // Extract output content
            try {
              const content = response?.content as
                | Array<Record<string, unknown>>
                | undefined;
              if (content && content.length > 0) {
                span.setAttribute(
                  AgentQAttributes.LLM_OUTPUT,
                  JSON.stringify(content),
                );
              }
            } catch {
              // Ignore
            }

            // Capture stop reason
            if (response?.stop_reason) {
              span.setAttribute(
                "gen_ai.finish_reason",
                String(response.stop_reason),
              );
            }

            span.setStatus({ code: SpanStatusCode.OK });
            return result;
          } catch (error) {
            if (error instanceof Error) {
              span.recordException(error);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message,
              });
            }
            throw error;
          } finally {
            span.end();
          }
        },
      );
    };

    messagesObj.__agentq_patched = true;
  }

  // Proxy the constructor to patch instances after creation
  const handler: ProxyHandler<typeof OriginalConstructor> = {
    construct(target, args) {
      const instance = new target(...args) as Record<string, unknown>;

      // Patch messages.create
      const messages = instance.messages as
        | Record<string, unknown>
        | undefined;
      if (messages) {
        patchMessagesCreate(messages);
      }

      // Patch completions.create (legacy endpoint)
      const completions = instance.completions as
        | Record<string, unknown>
        | undefined;
      if (
        completions &&
        typeof completions.create === "function" &&
        !completions.__agentq_patched
      ) {
        const originalCreate = (completions.create as Function).bind(
          completions,
        );
        completions.create = async function patchedCompletionsCreate(
          params: Record<string, unknown>,
          options?: unknown,
        ): Promise<unknown> {
          const tracer = getTracer();
          const model = (params?.model as string) ?? "unknown";
          return tracer.startActiveSpan(
            `llm.anthropic.${model}`,
            { kind: SpanKind.CLIENT },
            async (span) => {
              span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.LLM);
              span.setAttribute(AgentQAttributes.LLM_SYSTEM, "anthropic");
              span.setAttribute(AgentQAttributes.LLM_MODEL, model);

              applySessionToSpan(span);

              try {
                const result = await originalCreate(params, options);
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
              } catch (error) {
                if (error instanceof Error) {
                  span.recordException(error);
                  span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error.message,
                  });
                }
                throw error;
              } finally {
                span.end();
              }
            },
          );
        };
        completions.__agentq_patched = true;
      }

      return instance;
    },
  };

  const PatchedAnthropic = new Proxy(OriginalConstructor, handler);

  // Replace exports
  if (moduleExports.default === AnthropicClass) {
    moduleExports.default = PatchedAnthropic;
  }
  if (moduleExports.Anthropic === AnthropicClass) {
    moduleExports.Anthropic = PatchedAnthropic;
  }

  return true;
}
