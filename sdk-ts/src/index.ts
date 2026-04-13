/**
 * AgentQ TypeScript SDK
 *
 * Trace and observe AI agent workflows with OpenTelemetry.
 *
 * @example Quick start
 * ```ts
 * import { init, instrument, agent, session } from "agentq";
 *
 * init({ apiKey: "aq_..." });
 * instrument();
 *
 * const myAgent = agent("researcher", async (query: string) => {
 *   const openai = new OpenAI();
 *   const res = await openai.chat.completions.create({
 *     model: "gpt-4o",
 *     messages: [{ role: "user", content: query }],
 *   });
 *   return res.choices[0].message.content;
 * });
 *
 * await session({ sessionId: "sess_1", userId: "user_1" }, async () => {
 *   await myAgent("What is quantum computing?");
 * });
 * ```
 *
 * @packageDocumentation
 */

import type { Tracer } from "@opentelemetry/api";
import { initTracer, shutdown as shutdownTracer, flush as flushTracer, isInitialized } from "./tracer.js";
import { patchOpenAI, patchAnthropic, patchVercelAI } from "./instrumentations/index.js";
import type { InitOptions, InstrumentOptions } from "./types.js";

// ── init ─────────────────────────────────────────────────────────────────

/**
 * Initialize the AgentQ tracing pipeline.
 *
 * Must be called before any other AgentQ functions.
 *
 * @param options - Configuration options (API key, endpoint, service name, etc.)
 * @returns The configured OpenTelemetry Tracer instance
 *
 * @example
 * ```ts
 * import { init } from "agentq";
 *
 * init({
 *   apiKey: "aq_your_key",
 *   serviceName: "my-agent-app",
 * });
 * ```
 */
export function init(options: InitOptions = {}): Tracer {
  return initTracer(options);
}

// ── instrument ───────────────────────────────────────────────────────────

/**
 * Auto-instrument popular LLM SDKs.
 *
 * Call this after `init()` to automatically trace calls made via
 * OpenAI, Anthropic, and/or Vercel AI SDKs.
 *
 * @param options - Choose which SDKs to instrument (all enabled by default)
 * @returns Object indicating which SDKs were successfully patched
 *
 * @example
 * ```ts
 * import { init, instrument } from "agentq";
 *
 * init();
 * const result = instrument(); // patches all available SDKs
 * console.log(result); // { openai: true, anthropic: false, vercelAI: true }
 * ```
 */
export function instrument(
  options: InstrumentOptions = {},
): { openai: boolean; anthropic: boolean; vercelAI: boolean } {
  if (!isInitialized()) {
    throw new Error(
      "AgentQ SDK not initialized. Call `init()` before `instrument()`.",
    );
  }

  const instrumentOpenAI = options.openai !== false;
  const instrumentAnthropic = options.anthropic !== false;
  const instrumentVercelAI = options.vercelAI !== false;

  const results = {
    openai: false,
    anthropic: false,
    vercelAI: false,
  };

  if (instrumentOpenAI) {
    try {
      results.openai = patchOpenAI();
    } catch {
      results.openai = false;
    }
  }

  if (instrumentAnthropic) {
    try {
      results.anthropic = patchAnthropic();
    } catch {
      results.anthropic = false;
    }
  }

  if (instrumentVercelAI) {
    try {
      results.vercelAI = patchVercelAI();
    } catch {
      results.vercelAI = false;
    }
  }

  return results;
}

// ── shutdown / flush ─────────────────────────────────────────────────────

/**
 * Gracefully shut down the tracing pipeline.
 * Flushes any pending spans before shutdown.
 */
export async function shutdown(): Promise<void> {
  return shutdownTracer();
}

/**
 * Force-flush any pending spans without shutting down.
 */
export async function flush(): Promise<void> {
  return flushTracer();
}

// ── Re-exports ───────────────────────────────────────────────────────────

export { agent, Agent } from "./agent.js";
export { session } from "./session.js";
export { trackLLM, trackTool, trackAgent, currentSpan } from "./spans.js";

// Types
export type {
  InitOptions,
  SessionOptions,
  InstrumentOptions,
  TrackLLMOptions,
  TrackToolOptions,
  TrackAgentOptions,
  AgentQSpan,
  SessionContext,
} from "./types.js";

export { AgentQAttributes, SpanType } from "./types.js";

// Low-level access
export { getTracer, getActiveSpan, isInitialized, createTestExporter } from "./tracer.js";
export { getSessionContext } from "./context.js";
