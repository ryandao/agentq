/**
 * @agentq/sdk — TypeScript SDK for AgentQ
 *
 * Auto-detect and integrate with popular agent frameworks
 * (LangChain, CrewAI, AutoGen, LlamaIndex) without manual instrumentation.
 *
 * @example
 * ```ts
 * import { AgentQ, autoIntegrate, Framework } from "@agentq/sdk";
 *
 * // Quick start: auto-detect everything
 * const agentq = autoIntegrate();
 *
 * // Or configure manually
 * const agentq = new AgentQ({
 *   frameworks: [Framework.LANGCHAIN],
 *   onEvent: (event) => console.log(event),
 *   debug: true,
 * });
 * agentq.init();
 * ```
 *
 * @packageDocumentation
 */

// Core
export { AgentQ, autoIntegrate } from "./core.js";

// Types
export {
  Framework,
  FRAMEWORKS,
  AgentEvent,
  type EventPayload,
  type EventHandler,
  type DetectionResult,
  type AgentQConfig,
  type AgentMeta,
  type FrameworkSpec,
} from "./types.js";

// Detection
export { FrameworkDetector } from "./detection.js";

// Registry
export { AdapterRegistry } from "./registry.js";

// Adapters (re-export from subpath)
export { BaseAdapter } from "./adapters/base.js";
export { LangChainAdapter } from "./adapters/langchain.js";
export { CrewAIAdapter } from "./adapters/crewai.js";
export { AutoGenAdapter } from "./adapters/autogen.js";
export { LlamaIndexAdapter } from "./adapters/llamaindex.js";
