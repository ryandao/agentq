/**
 * Core AgentQ client — the main entry point for the TypeScript SDK.
 *
 * Provides:
 * - Automatic framework detection and integration
 * - Manual agent wrapping
 * - Event subscription
 * - Configuration management
 */

import {
  Framework,
  FRAMEWORKS,
  type AgentQConfig,
  type EventHandler,
  type AgentMeta,
} from "./types.js";
import { FrameworkDetector } from "./detection.js";
import { AdapterRegistry } from "./registry.js";
import { BaseAdapter } from "./adapters/base.js";
import { logger, setDebug } from "./logger.js";

/**
 * Main AgentQ client.
 *
 * @example
 * ```ts
 * // Auto-detect and integrate with all installed frameworks
 * const agentq = new AgentQ({ autoPatch: true });
 * await agentq.init();
 *
 * // Or manually wrap specific agents
 * const agentq = new AgentQ();
 * const wrappedAgent = agentq.wrap(myLangChainAgent, Framework.LANGCHAIN);
 * ```
 */
export class AgentQ {
  private readonly config: Required<
    Pick<AgentQConfig, "autoPatch" | "debug">
  > &
    AgentQConfig;
  private readonly detector: FrameworkDetector;
  private readonly registry: AdapterRegistry;
  private readonly eventHandlers: EventHandler[] = [];
  private readonly agents = new Map<string, AgentMeta>();
  private initialized = false;

  constructor(config: AgentQConfig = {}) {
    this.config = {
      apiUrl: config.apiUrl ?? process.env.AGENTQ_API_URL ?? "http://localhost:3000",
      apiKey: config.apiKey ?? process.env.AGENTQ_API_KEY,
      frameworks: config.frameworks ?? FRAMEWORKS,
      autoPatch: config.autoPatch ?? true,
      onEvent: config.onEvent,
      debug: config.debug ?? false,
    };

    if (this.config.debug) {
      setDebug(true);
    }

    this.detector = new FrameworkDetector();
    this.registry = new AdapterRegistry();

    // Register the config-level event handler
    if (this.config.onEvent) {
      this.onEvent(this.config.onEvent);
    }
  }

  /**
   * Initialize AgentQ: detect frameworks and optionally auto-patch.
   *
   * @returns Array of frameworks that were detected and patched.
   */
  init(): Framework[] {
    if (this.initialized) {
      logger.warn("AgentQ is already initialized");
      return [];
    }

    logger.info("Initializing AgentQ SDK");

    const targetFrameworks = this.config.frameworks ?? FRAMEWORKS;
    const detected: Framework[] = [];

    for (const fw of targetFrameworks) {
      const result = this.detector.detect(fw);
      if (result.installed) {
        logger.info(
          `Detected ${fw}${result.version ? ` v${result.version}` : ""} (active: ${result.active})`,
        );
        detected.push(fw);

        if (this.config.autoPatch) {
          this.patchFramework(fw);
        }
      }
    }

    this.initialized = true;
    logger.info(
      `AgentQ initialized. Detected frameworks: ${detected.length > 0 ? detected.join(", ") : "none"}`,
    );

    return detected;
  }

  /**
   * Manually patch a specific framework.
   */
  patchFramework(framework: Framework): void {
    const adapter = this.registry.get(framework);
    if (adapter.isPatched) {
      logger.debug(`${framework} is already patched`);
      return;
    }

    // Apply event handlers
    for (const handler of this.eventHandlers) {
      adapter.onEvent(handler);
    }

    adapter.patch();
  }

  /**
   * Unpatch a specific framework.
   */
  unpatchFramework(framework: Framework): void {
    const adapter = this.registry.get(framework);
    adapter.unpatch();
  }

  /**
   * Wrap an agent instance for AgentQ integration.
   *
   * @param agent - The framework-native agent instance
   * @param framework - Which framework the agent belongs to
   * @param agentId - Optional custom ID for the agent
   * @returns The wrapped agent with the same type
   */
  wrap<T>(agent: T, framework: Framework, agentId?: string): T {
    const adapter = this.registry.get(framework);
    const wrapped = adapter.wrapAgent(agent, agentId);

    // Record metadata
    const id = agentId ?? (agent && typeof agent === "object"
      ? ((agent as Record<string, unknown>).name as string) ?? `agent-${this.agents.size}`
      : `agent-${this.agents.size}`);

    this.agents.set(id, {
      id,
      framework,
      name: id,
    });

    return wrapped;
  }

  /**
   * Register an event handler for all agent lifecycle events.
   */
  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
    // Also register on existing adapter instances
    this.registry.onEvent(handler);
  }

  /**
   * Get the adapter for a specific framework.
   */
  getAdapter(framework: Framework): BaseAdapter {
    return this.registry.get(framework);
  }

  /**
   * Get the framework detector instance.
   */
  getDetector(): FrameworkDetector {
    return this.detector;
  }

  /**
   * Get the adapter registry instance.
   */
  getRegistry(): AdapterRegistry {
    return this.registry;
  }

  /**
   * Get all registered agent metadata.
   */
  getAgents(): AgentMeta[] {
    return [...this.agents.values()];
  }

  /**
   * Tear down: unpatch all frameworks and clear state.
   */
  destroy(): void {
    logger.info("Destroying AgentQ instance");
    this.registry.unpatchAll();
    this.registry.clear();
    this.agents.clear();
    this.eventHandlers.length = 0;
    this.initialized = false;
  }
}

// ---------------------------------------------------------------------------
// Convenience function
// ---------------------------------------------------------------------------

/**
 * One-liner to auto-detect and integrate with all installed agent frameworks.
 *
 * @example
 * ```ts
 * import { autoIntegrate } from "@agentq/sdk";
 *
 * const agentq = autoIntegrate({
 *   onEvent: (event) => console.log(event),
 * });
 * ```
 */
export function autoIntegrate(config: AgentQConfig = {}): AgentQ {
  const agentq = new AgentQ({ ...config, autoPatch: true });
  agentq.init();
  return agentq;
}
