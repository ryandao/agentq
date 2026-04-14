/**
 * AgentQ TypeScript SDK
 *
 * A TypeScript SDK for the AgentQ agent management platform.
 * Provides agent registration, decorator-based agent definition,
 * and a client for interacting with the AgentQ API.
 *
 * @packageDocumentation
 *
 * @example
 * ```ts
 * import { AgentQClient, agent, AgentRegistry } from "@agentq/sdk";
 *
 * // Option 1: Use the client directly
 * const client = new AgentQClient({
 *   baseUrl: "https://api.agentq.dev",
 *   apiKey: "your-api-key",
 * });
 * const myAgent = await client.registerAgent({
 *   name: "my-agent",
 *   capabilities: ["chat"],
 * });
 *
 * // Option 2: Use the @agent decorator
 * @agent({ name: "MyBot", capabilities: ["chat"] })
 * class MyBot {
 *   async run(input: string) { return "Hello!"; }
 * }
 *
 * // Sync all decorated agents with the platform
 * await AgentRegistry.getInstance().syncAll({
 *   baseUrl: "https://api.agentq.dev",
 *   apiKey: "your-api-key",
 * });
 * ```
 */

// ── Types ───────────────────────────────────────────────────────────────
export type {
  AgentFramework,
  AgentStatus,
  AgentQConfig,
  AgentMetadata,
  AgentDecoratorOptions,
  Agent,
  RegisterAgentRequest,
  UpdateAgentRequest,
  PaginatedResponse,
  ListAgentsParams,
  HeartbeatPayload,
  ApiError,
  AgentTask,
} from "./types/index.js";

// ── Client ──────────────────────────────────────────────────────────────
export { AgentQClient } from "./client/index.js";

// ── Decorators ──────────────────────────────────────────────────────────
export { agent, getAgentMetadata, AGENT_METADATA_KEY } from "./decorators/index.js";
export type { AgentClass } from "./decorators/index.js";

// ── Registry ────────────────────────────────────────────────────────────
export { AgentRegistry } from "./registry.js";

// ── Errors ──────────────────────────────────────────────────────────────
export {
  AgentQError,
  AgentQApiError,
  AgentQConfigError,
  AgentQNetworkError,
  AgentQTimeoutError,
  AgentNotFoundError,
} from "./errors.js";
