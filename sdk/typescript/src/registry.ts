/**
 * Global agent registry for tracking decorated agents.
 *
 * The registry collects metadata from all @agent-decorated classes
 * and can bulk-register them with the AgentQ platform.
 */

import type { AgentQConfig, AgentMetadata, Agent } from "./types/index.js";
import { AgentQClient } from "./client/index.js";

/**
 * Singleton registry that collects all agents decorated with @agent.
 *
 * @example
 * ```ts
 * import { AgentRegistry } from "@agentq/sdk";
 *
 * const registry = AgentRegistry.getInstance();
 *
 * // Manually register an agent (alternative to the @agent decorator)
 * registry.register({
 *   name: "my-agent",
 *   description: "A helpful agent",
 *   capabilities: ["chat"],
 * });
 *
 * // Sync all registered agents with the AgentQ platform
 * const agents = await registry.syncAll({
 *   baseUrl: "https://api.agentq.dev",
 *   apiKey: "your-api-key",
 * });
 * ```
 */
export class AgentRegistry {
  private static instance: AgentRegistry;
  private readonly agents: Map<string, AgentMetadata> = new Map();

  private constructor() {}

  /** Get the singleton registry instance. */
  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  /**
   * Reset the singleton instance. Primarily useful for testing.
   */
  static resetInstance(): void {
    AgentRegistry.instance = new AgentRegistry();
  }

  /**
   * Register an agent's metadata in the local registry.
   * Does not communicate with the server — use syncAll() for that.
   *
   * @param metadata - The agent metadata to register.
   */
  register(metadata: AgentMetadata): void {
    this.agents.set(metadata.name, metadata);
  }

  /**
   * Remove an agent from the local registry by name.
   * @param name - The agent name.
   * @returns true if the agent was found and removed.
   */
  unregister(name: string): boolean {
    return this.agents.delete(name);
  }

  /**
   * Get metadata for a registered agent.
   * @param name - The agent name.
   */
  get(name: string): AgentMetadata | undefined {
    return this.agents.get(name);
  }

  /**
   * Get all registered agent metadata.
   */
  getAll(): AgentMetadata[] {
    return Array.from(this.agents.values());
  }

  /**
   * Check if an agent is registered locally.
   * @param name - The agent name.
   */
  has(name: string): boolean {
    return this.agents.has(name);
  }

  /** Get the number of registered agents. */
  get size(): number {
    return this.agents.size;
  }

  /**
   * Clear all registered agents from the local registry.
   */
  clear(): void {
    this.agents.clear();
  }

  /**
   * Sync all locally registered agents with the AgentQ platform.
   * Registers each agent via the API and returns the server responses.
   *
   * @param config - AgentQ server configuration.
   * @returns An array of registered Agent objects from the server.
   */
  async syncAll(config: AgentQConfig): Promise<Agent[]> {
    const client = new AgentQClient(config);
    const results: Agent[] = [];

    for (const metadata of this.agents.values()) {
      const agent = await client.registerAgent({
        name: metadata.name,
        description: metadata.description,
        version: metadata.version,
        framework: metadata.framework,
        capabilities: metadata.capabilities,
        tags: metadata.tags,
      });
      results.push(agent);
    }

    return results;
  }
}
