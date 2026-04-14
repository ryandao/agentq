/**
 * TypeScript decorators for AgentQ agent registration.
 *
 * Provides the @agent decorator (mirroring the Python SDK's @agent decorator)
 * that automatically registers a class as an AgentQ agent.
 *
 * @example
 * ```ts
 * import { agent } from "@agentq/sdk";
 *
 * @agent({
 *   name: "MyAssistant",
 *   description: "A helpful AI assistant",
 *   capabilities: ["chat", "search"],
 * })
 * class MyAssistant {
 *   async run(input: string): Promise<string> {
 *     return `Response to: ${input}`;
 *   }
 * }
 * ```
 */

import type {
  AgentDecoratorOptions,
  AgentMetadata,
} from "../types/index.js";
import { AgentRegistry } from "../registry.js";

/** Symbol used to store agent metadata on decorated classes. */
export const AGENT_METADATA_KEY = Symbol("agentq:metadata");

/**
 * Interface that decorated agent classes implement.
 * Allows the SDK to retrieve metadata from a class.
 */
export interface AgentClass {
  new (...args: unknown[]): unknown;
  [AGENT_METADATA_KEY]?: AgentMetadata;
}

/**
 * Class decorator that marks a class as an AgentQ agent.
 *
 * This is the TypeScript equivalent of the Python SDK's `@agent` decorator.
 * It attaches metadata to the class and optionally registers it with the
 * global agent registry.
 *
 * @param options - Configuration options for the agent.
 * @returns A class decorator.
 *
 * @example
 * ```ts
 * @agent({ name: "Summarizer", capabilities: ["summarize"] })
 * class SummarizerAgent {
 *   async run(input: string): Promise<string> {
 *     // implementation
 *   }
 * }
 * ```
 */
export function agent(options: AgentDecoratorOptions = {}) {
  return function <T extends new (...args: unknown[]) => unknown>(
    target: T
  ): T {
    const metadata: AgentMetadata = {
      name: options.name ?? target.name,
      description: options.description,
      version: options.version,
      framework: options.framework,
      capabilities: options.capabilities,
    };

    // Attach metadata to the class
    Object.defineProperty(target, AGENT_METADATA_KEY, {
      value: metadata,
      writable: false,
      enumerable: false,
      configurable: false,
    });

    // Register with the global registry if autoRegister is not explicitly false
    if (options.autoRegister !== false) {
      AgentRegistry.getInstance().register(metadata);
    }

    return target;
  };
}

/**
 * Retrieve the AgentQ metadata from a decorated class.
 * Returns undefined if the class has not been decorated with @agent.
 */
export function getAgentMetadata(
  target: AgentClass | (new (...args: unknown[]) => unknown)
): AgentMetadata | undefined {
  return (target as AgentClass)[AGENT_METADATA_KEY];
}
