/**
 * Adapter registry — manages the mapping between frameworks and their adapters.
 *
 * The registry is the central coordination point that:
 * 1. Maps each Framework to its concrete adapter implementation
 * 2. Provides lazy instantiation of adapters
 * 3. Ensures only one adapter instance per framework
 * 4. Supports custom adapter registration for extensibility
 */

import { Framework, type EventHandler } from "./types.js";
import { BaseAdapter } from "./adapters/base.js";
import { LangChainAdapter } from "./adapters/langchain.js";
import { CrewAIAdapter } from "./adapters/crewai.js";
import { AutoGenAdapter } from "./adapters/autogen.js";
import { LlamaIndexAdapter } from "./adapters/llamaindex.js";
import { logger } from "./logger.js";

/** Factory function that creates an adapter instance. */
type AdapterFactory = () => BaseAdapter;

/**
 * Registry of framework adapters.
 *
 * @example
 * ```ts
 * const registry = new AdapterRegistry();
 * const adapter = registry.get(Framework.LANGCHAIN);
 * adapter.patch();
 * ```
 */
export class AdapterRegistry {
  private readonly factories = new Map<Framework, AdapterFactory>();
  private readonly instances = new Map<Framework, BaseAdapter>();

  constructor() {
    // Register built-in adapters
    this.registerFactory(Framework.LANGCHAIN, () => new LangChainAdapter());
    this.registerFactory(Framework.CREWAI, () => new CrewAIAdapter());
    this.registerFactory(Framework.AUTOGEN, () => new AutoGenAdapter());
    this.registerFactory(Framework.LLAMAINDEX, () => new LlamaIndexAdapter());
  }

  /**
   * Register a custom adapter factory for a framework.
   * This allows users to replace or extend the built-in adapters.
   */
  registerFactory(framework: Framework, factory: AdapterFactory): void {
    this.factories.set(framework, factory);
    // Clear cached instance so next get() uses the new factory
    this.instances.delete(framework);
  }

  /**
   * Register a custom adapter class for a framework.
   * Convenience method that wraps the class in a factory.
   */
  register(framework: Framework, AdapterClass: new () => BaseAdapter): void {
    this.registerFactory(framework, () => new AdapterClass());
  }

  /**
   * Get (or lazily create) the adapter for a framework.
   *
   * @throws Error if no adapter is registered for the framework.
   */
  get(framework: Framework): BaseAdapter {
    const existing = this.instances.get(framework);
    if (existing) return existing;

    const factory = this.factories.get(framework);
    if (!factory) {
      throw new Error(`No adapter registered for framework: ${framework}`);
    }

    const adapter = factory();
    this.instances.set(framework, adapter);
    logger.debug(`Created adapter instance for ${framework}`);
    return adapter;
  }

  /**
   * Check if an adapter is registered for the given framework.
   */
  has(framework: Framework): boolean {
    return this.factories.has(framework);
  }

  /**
   * Get all currently instantiated adapters.
   */
  getActive(): BaseAdapter[] {
    return [...this.instances.values()];
  }

  /**
   * Register an event handler on all adapters (current and future).
   */
  onEvent(handler: EventHandler): void {
    // Apply to existing instances
    for (const adapter of this.instances.values()) {
      adapter.onEvent(handler);
    }
    // Store for future instances
    this._globalHandlers.push(handler);
  }

  private readonly _globalHandlers: EventHandler[] = [];

  /**
   * Unpatch all active adapters.
   */
  unpatchAll(): void {
    for (const adapter of this.instances.values()) {
      if (adapter.isPatched) {
        adapter.unpatch();
      }
    }
  }

  /**
   * Clear all instances (does not unpatch — call unpatchAll first).
   */
  clear(): void {
    this.instances.clear();
  }
}
