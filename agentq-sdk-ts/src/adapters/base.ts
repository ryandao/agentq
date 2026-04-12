/**
 * Base adapter interface for framework integration.
 *
 * All framework-specific adapters extend BaseAdapter and implement
 * the hooks that AgentQ uses to observe and orchestrate agent execution.
 *
 * The adapter pattern ensures that user code doesn't need manual
 * instrumentation. Instead, the adapter intercepts framework internals
 * to provide telemetry, logging, and orchestration support automatically.
 */

import { AgentEvent, type EventPayload, type EventHandler, type Framework } from "../types.js";
import { generateRunId, deriveAgentId } from "../utils.js";
import { logger } from "../logger.js";

/**
 * Abstract base class for framework adapters.
 *
 * Subclasses must implement:
 * - `patch()` — hook into the framework to intercept lifecycle events
 * - `unpatch()` — revert any modifications made by `patch()`
 * - `wrapAgent()` — wrap a single agent instance for AgentQ integration
 */
export abstract class BaseAdapter {
  /** Which framework this adapter handles. */
  abstract readonly framework: Framework;

  private _patched = false;
  private readonly eventHandlers: EventHandler[] = [];
  protected readonly wrappedAgents = new Map<string, unknown>();

  /** Whether the adapter has been patched into the framework. */
  get isPatched(): boolean {
    return this._patched;
  }

  /** Register a handler for agent lifecycle events. */
  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  /** Emit an event to all registered handlers. */
  protected emitEvent(
    event: AgentEvent,
    agentId: string,
    runId: string,
    data: Record<string, unknown> = {},
    parentRunId?: string,
  ): void {
    const payload: EventPayload = {
      event,
      agentId,
      runId,
      timestamp: Date.now(),
      data,
      parentRunId,
    };

    for (const handler of this.eventHandlers) {
      try {
        handler(payload);
      } catch (err) {
        logger.error(`Event handler error for ${event}`, err);
      }
    }
  }

  /** Generate a unique run ID. */
  protected generateRunId(): string {
    return generateRunId();
  }

  /** Derive an agent ID from an agent instance or provided value. */
  protected deriveAgentId(agent: unknown, providedId?: string): string {
    return deriveAgentId(agent, providedId);
  }

  /**
   * Apply framework-level hooks. Called once during integration setup.
   * Subclasses should call `super.markPatched()` after successful patching.
   */
  abstract patch(): void;

  /**
   * Remove framework-level hooks. Reverts changes made by `patch()`.
   * Subclasses should call `super.markUnpatched()` after successful unpatching.
   */
  abstract unpatch(): void;

  /**
   * Wrap a single agent instance for AgentQ integration.
   *
   * @param agent - The framework-native agent instance.
   * @param agentId - Optional identifier. If not provided, one is generated.
   * @returns The wrapped agent (or the same agent if patching is class-level).
   */
  abstract wrapAgent<T>(agent: T, agentId?: string): T;

  /** Mark the adapter as patched. Call from subclass `patch()`. */
  protected markPatched(): void {
    this._patched = true;
  }

  /** Mark the adapter as unpatched. Call from subclass `unpatch()`. */
  protected markUnpatched(): void {
    this._patched = false;
    this.wrappedAgents.clear();
  }
}
