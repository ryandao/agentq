import {
  SpanKind,
  SpanStatusCode,
} from "@opentelemetry/api";
import { getTracer } from "../tracer.js";
import { getSessionContext } from "../context.js";
import { AgentQAttributes, SpanType } from "../types.js";

/**
 * Patch the Vercel AI SDK to automatically create spans for API calls.
 *
 * Instruments:
 *  - `generateText()`
 *  - `streamText()`
 *  - `generateObject()`
 *  - `streamObject()`
 */
export function patchVercelAI(): boolean {
  let aiModule: Record<string, unknown>;
  try {
    aiModule = require("ai") as Record<string, unknown>;
  } catch {
    return false;
  }

  if (!aiModule) return false;

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

  function extractModelInfo(params: Record<string, unknown>): {
    modelName: string;
    provider: string;
  } {
    // Vercel AI SDK passes model as a model object with a modelId property
    const model = params?.model as Record<string, unknown> | undefined;
    if (model) {
      const modelId =
        (model.modelId as string) ??
        (model.id as string) ??
        "unknown";
      const provider =
        (model.provider as string) ?? "unknown";
      return { modelName: modelId, provider };
    }
    return { modelName: "unknown", provider: "unknown" };
  }

  let patched = false;

  // Patch generateText
  if (typeof aiModule.generateText === "function") {
    const originalGenerateText = aiModule.generateText as (
      params: Record<string, unknown>,
    ) => Promise<unknown>;

    aiModule.generateText = async function patchedGenerateText(
      params: Record<string, unknown>,
    ): Promise<unknown> {
      const tracer = getTracer();
      const { modelName, provider } = extractModelInfo(params);
      const spanName = `llm.${provider}.generateText`;

      return tracer.startActiveSpan(
        spanName,
        { kind: SpanKind.CLIENT },
        async (span) => {
          span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.LLM);
          span.setAttribute(AgentQAttributes.LLM_SYSTEM, provider);
          span.setAttribute(AgentQAttributes.LLM_MODEL, modelName);

          if (params?.temperature !== undefined) {
            span.setAttribute(
              AgentQAttributes.LLM_TEMPERATURE,
              params.temperature as number,
            );
          }
          if (params?.maxTokens !== undefined) {
            span.setAttribute(
              AgentQAttributes.LLM_MAX_TOKENS,
              params.maxTokens as number,
            );
          }

          // Capture prompt/messages
          try {
            if (params?.prompt) {
              span.setAttribute(
                AgentQAttributes.LLM_INPUT,
                typeof params.prompt === "string"
                  ? params.prompt
                  : JSON.stringify(params.prompt),
              );
            } else if (params?.messages) {
              span.setAttribute(
                AgentQAttributes.LLM_INPUT,
                JSON.stringify(params.messages),
              );
            }
          } catch {
            // Ignore
          }

          applySessionToSpan(span);

          try {
            const result = await originalGenerateText(params);
            const response = result as Record<string, unknown>;

            // Extract usage
            const usage = response?.usage as
              | Record<string, number>
              | undefined;
            if (usage) {
              if (usage.promptTokens !== undefined) {
                span.setAttribute(
                  AgentQAttributes.LLM_USAGE_INPUT_TOKENS,
                  usage.promptTokens,
                );
              }
              if (usage.completionTokens !== undefined) {
                span.setAttribute(
                  AgentQAttributes.LLM_USAGE_OUTPUT_TOKENS,
                  usage.completionTokens,
                );
              }
              if (usage.totalTokens !== undefined) {
                span.setAttribute(
                  AgentQAttributes.LLM_USAGE_TOTAL_TOKENS,
                  usage.totalTokens,
                );
              }
            }

            // Extract text output
            if (response?.text) {
              try {
                span.setAttribute(
                  AgentQAttributes.LLM_OUTPUT,
                  String(response.text),
                );
              } catch {
                // Ignore
              }
            }

            if (response?.finishReason) {
              span.setAttribute(
                "gen_ai.finish_reason",
                String(response.finishReason),
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
    patched = true;
  }

  // Patch streamText
  if (typeof aiModule.streamText === "function") {
    const originalStreamText = aiModule.streamText as (
      params: Record<string, unknown>,
    ) => unknown;

    aiModule.streamText = function patchedStreamText(
      params: Record<string, unknown>,
    ): unknown {
      const tracer = getTracer();
      const { modelName, provider } = extractModelInfo(params);
      const spanName = `llm.${provider}.streamText`;

      const span = tracer.startSpan(spanName, { kind: SpanKind.CLIENT });
      span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.LLM);
      span.setAttribute(AgentQAttributes.LLM_SYSTEM, provider);
      span.setAttribute(AgentQAttributes.LLM_MODEL, modelName);

      if (params?.temperature !== undefined) {
        span.setAttribute(
          AgentQAttributes.LLM_TEMPERATURE,
          params.temperature as number,
        );
      }
      if (params?.maxTokens !== undefined) {
        span.setAttribute(
          AgentQAttributes.LLM_MAX_TOKENS,
          params.maxTokens as number,
        );
      }

      try {
        if (params?.prompt) {
          span.setAttribute(
            AgentQAttributes.LLM_INPUT,
            typeof params.prompt === "string"
              ? params.prompt
              : JSON.stringify(params.prompt),
          );
        } else if (params?.messages) {
          span.setAttribute(
            AgentQAttributes.LLM_INPUT,
            JSON.stringify(params.messages),
          );
        }
      } catch {
        // Ignore
      }

      applySessionToSpan(span);

      try {
        const result = originalStreamText(params);

        // For streaming, we end the span when the stream is consumed.
        // Hook into the result's promise-like properties if available.
        const streamResult = result as Record<string, unknown>;
        if (streamResult?.usage && typeof (streamResult.usage as Record<string, unknown>)?.then === "function") {
          // Vercel AI SDK returns a usage promise
          (streamResult.usage as Promise<Record<string, number>>)
            .then((usage) => {
              if (usage.promptTokens !== undefined) {
                span.setAttribute(
                  AgentQAttributes.LLM_USAGE_INPUT_TOKENS,
                  usage.promptTokens,
                );
              }
              if (usage.completionTokens !== undefined) {
                span.setAttribute(
                  AgentQAttributes.LLM_USAGE_OUTPUT_TOKENS,
                  usage.completionTokens,
                );
              }
              if (usage.totalTokens !== undefined) {
                span.setAttribute(
                  AgentQAttributes.LLM_USAGE_TOTAL_TOKENS,
                  usage.totalTokens,
                );
              }
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
            })
            .catch((error: unknown) => {
              if (error instanceof Error) {
                span.recordException(error);
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
              }
              span.end();
            });
        } else {
          // If no usage promise, end span immediately
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          span.recordException(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
        }
        span.end();
        throw error;
      }
    };
    patched = true;
  }

  // Patch generateObject
  if (typeof aiModule.generateObject === "function") {
    const originalGenerateObject = aiModule.generateObject as (
      params: Record<string, unknown>,
    ) => Promise<unknown>;

    aiModule.generateObject = async function patchedGenerateObject(
      params: Record<string, unknown>,
    ): Promise<unknown> {
      const tracer = getTracer();
      const { modelName, provider } = extractModelInfo(params);
      const spanName = `llm.${provider}.generateObject`;

      return tracer.startActiveSpan(
        spanName,
        { kind: SpanKind.CLIENT },
        async (span) => {
          span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.LLM);
          span.setAttribute(AgentQAttributes.LLM_SYSTEM, provider);
          span.setAttribute(AgentQAttributes.LLM_MODEL, modelName);

          if (params?.temperature !== undefined) {
            span.setAttribute(
              AgentQAttributes.LLM_TEMPERATURE,
              params.temperature as number,
            );
          }

          try {
            if (params?.prompt) {
              span.setAttribute(
                AgentQAttributes.LLM_INPUT,
                typeof params.prompt === "string"
                  ? params.prompt
                  : JSON.stringify(params.prompt),
              );
            }
          } catch {
            // Ignore
          }

          applySessionToSpan(span);

          try {
            const result = await originalGenerateObject(params);
            const response = result as Record<string, unknown>;

            // Extract usage
            const usage = response?.usage as
              | Record<string, number>
              | undefined;
            if (usage) {
              if (usage.promptTokens !== undefined) {
                span.setAttribute(
                  AgentQAttributes.LLM_USAGE_INPUT_TOKENS,
                  usage.promptTokens,
                );
              }
              if (usage.completionTokens !== undefined) {
                span.setAttribute(
                  AgentQAttributes.LLM_USAGE_OUTPUT_TOKENS,
                  usage.completionTokens,
                );
              }
            }

            // Extract generated object
            if (response?.object !== undefined) {
              try {
                span.setAttribute(
                  AgentQAttributes.LLM_OUTPUT,
                  JSON.stringify(response.object),
                );
              } catch {
                // Ignore
              }
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
    patched = true;
  }

  // Patch streamObject
  if (typeof aiModule.streamObject === "function") {
    const originalStreamObject = aiModule.streamObject as (
      params: Record<string, unknown>,
    ) => unknown;

    aiModule.streamObject = function patchedStreamObject(
      params: Record<string, unknown>,
    ): unknown {
      const tracer = getTracer();
      const { modelName, provider } = extractModelInfo(params);
      const spanName = `llm.${provider}.streamObject`;

      const span = tracer.startSpan(spanName, { kind: SpanKind.CLIENT });
      span.setAttribute(AgentQAttributes.SPAN_TYPE, SpanType.LLM);
      span.setAttribute(AgentQAttributes.LLM_SYSTEM, provider);
      span.setAttribute(AgentQAttributes.LLM_MODEL, modelName);
      applySessionToSpan(span);

      try {
        const result = originalStreamObject(params);

        // End span when usage is available
        const streamResult = result as Record<string, unknown>;
        if (streamResult?.usage && typeof (streamResult.usage as Record<string, unknown>)?.then === "function") {
          (streamResult.usage as Promise<Record<string, number>>)
            .then((usage) => {
              if (usage.promptTokens !== undefined) {
                span.setAttribute(
                  AgentQAttributes.LLM_USAGE_INPUT_TOKENS,
                  usage.promptTokens,
                );
              }
              if (usage.completionTokens !== undefined) {
                span.setAttribute(
                  AgentQAttributes.LLM_USAGE_OUTPUT_TOKENS,
                  usage.completionTokens,
                );
              }
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
            })
            .catch((error: unknown) => {
              if (error instanceof Error) {
                span.recordException(error);
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
              }
              span.end();
            });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          span.recordException(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
        }
        span.end();
        throw error;
      }
    };
    patched = true;
  }

  return patched;
}
