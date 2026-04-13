import {
  SpanKind,
  SpanStatusCode,
} from "@opentelemetry/api";
import { getTracer } from "../tracer.js";
import { getSessionContext } from "../context.js";
import { AgentQAttributes, SpanType } from "../types.js";

/**
 * Patch the OpenAI Node SDK to automatically create spans for API calls.
 *
 * Instruments:
 *  - `openai.chat.completions.create()`
 *  - `openai.completions.create()`
 *  - `openai.embeddings.create()`
 */
export function patchOpenAI(): boolean {
  let OpenAI: unknown;
  try {
    // Dynamic require to handle optional peer dependency
    OpenAI = require("openai");
  } catch {
    return false;
  }

  const OpenAIClass = (OpenAI as { default?: unknown; OpenAI?: unknown })?.default ??
    (OpenAI as { OpenAI?: unknown })?.OpenAI ??
    OpenAI;

  if (!OpenAIClass || typeof OpenAIClass !== "function") {
    return false;
  }

  const OriginalConstructor = OpenAIClass as new (...args: unknown[]) => Record<string, unknown>;

  // Patch at the module level by wrapping the constructor
  const patchedExports = OpenAI as Record<string, unknown>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function patchCompletionsCreate(completionsObj: any): void {
    if (!completionsObj || typeof completionsObj.create !== "function") return;
    if (completionsObj.__agentq_patched) return;

    const originalCreate = completionsObj.create.bind(completionsObj);
    completionsObj.create = async function patchedCreate(
      params: Record<string, unknown>,
      options?: unknown,
    ): Promise<unknown> {
      const tracer = getTracer();
      const model = (params?.model as string) ?? "unknown";
      const spanName = `llm.openai.${model}`;

      return tracer.startActiveSpan(
        spanName,
        { kind: SpanKind.CLIENT },
        async (span) => {
          span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.LLM);
          span.setAttribute(AgentQAttributes.LLM_SYSTEM, "openai");
          span.setAttribute(AgentQAttributes.LLM_MODEL, model);

          if (params?.temperature !== undefined) {
            span.setAttribute(AgentQAttributes.LLM_TEMPERATURE, params.temperature as number);
          }
          if (params?.max_tokens !== undefined) {
            span.setAttribute(AgentQAttributes.LLM_MAX_TOKENS, params.max_tokens as number);
          }

          // Capture input
          try {
            const messages = params?.messages;
            if (messages) {
              span.setAttribute(AgentQAttributes.LLM_INPUT, JSON.stringify(messages));
            }
          } catch {
            // Ignore serialization errors
          }

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
            const result = await originalCreate(params, options);

            // Extract usage from response
            const response = result as Record<string, unknown>;
            const usage = response?.usage as Record<string, number> | undefined;
            if (usage) {
              if (usage.prompt_tokens !== undefined) {
                span.setAttribute(AgentQAttributes.LLM_USAGE_INPUT_TOKENS, usage.prompt_tokens);
              }
              if (usage.completion_tokens !== undefined) {
                span.setAttribute(AgentQAttributes.LLM_USAGE_OUTPUT_TOKENS, usage.completion_tokens);
              }
              if (usage.total_tokens !== undefined) {
                span.setAttribute(AgentQAttributes.LLM_USAGE_TOTAL_TOKENS, usage.total_tokens);
              }
            }

            // Extract output
            try {
              const choices = (response?.choices as Array<Record<string, unknown>>) ?? [];
              if (choices.length > 0) {
                const output = choices.map((c) => c.message ?? c.text).filter(Boolean);
                span.setAttribute(AgentQAttributes.LLM_OUTPUT, JSON.stringify(output));
              }
            } catch {
              // Ignore
            }

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
    completionsObj.__agentq_patched = true;
  }

  // Use a Proxy on the constructor to intercept instance creation
  const handler: ProxyHandler<typeof OriginalConstructor> = {
    construct(target, args) {
      const instance = new target(...args) as Record<string, unknown>;

      // Patch chat.completions.create
      const chat = instance.chat as Record<string, unknown> | undefined;
      if (chat?.completions) {
        patchCompletionsCreate(chat.completions);
      }

      // Patch completions.create (legacy)
      if (instance.completions && typeof (instance.completions as Record<string, unknown>).create === "function") {
        patchCompletionsCreate(instance.completions);
      }

      // Patch embeddings.create
      if (instance.embeddings && typeof (instance.embeddings as Record<string, unknown>).create === "function") {
        const embeddings = instance.embeddings as Record<string, unknown>;
        if (!embeddings.__agentq_patched) {
          const originalEmbCreate = (embeddings.create as Function).bind(embeddings);
          embeddings.create = async function patchedEmbeddingsCreate(
            params: Record<string, unknown>,
            options?: unknown,
          ): Promise<unknown> {
            const tracer = getTracer();
            return tracer.startActiveSpan(
              `llm.openai.embeddings`,
              { kind: SpanKind.CLIENT },
              async (span) => {
                span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.LLM);
                span.setAttribute(AgentQAttributes.LLM_SYSTEM, "openai");
                span.setAttribute(AgentQAttributes.LLM_MODEL, (params?.model as string) ?? "unknown");

                const session = getSessionContext();
                if (session?.sessionId) span.setAttribute(AgentQAttributes.SESSION_ID, session.sessionId);
                if (session?.runId) span.setAttribute(AgentQAttributes.RUN_ID, session.runId);

                try {
                  const result = await originalEmbCreate(params, options);
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
          embeddings.__agentq_patched = true;
        }
      }

      return instance;
    },
  };

  const PatchedOpenAI = new Proxy(OriginalConstructor, handler);

  // Replace exports
  if (patchedExports.default === OpenAIClass) {
    patchedExports.default = PatchedOpenAI;
  }
  if (patchedExports.OpenAI === OpenAIClass) {
    patchedExports.OpenAI = PatchedOpenAI;
  }

  return true;
}
