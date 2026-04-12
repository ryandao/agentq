/**
 * LangChain adapter for AgentQ.
 *
 * Hooks into LangChain's callback system to intercept agent lifecycle
 * events without requiring the @agent decorator.
 */

import { Framework, AgentEvent } from "../types.js";
import { BaseAdapter } from "./base.js";
import { tryRequire } from "../utils.js";
import { logger } from "../logger.js";

export class LangChainAdapter extends BaseAdapter {
  readonly framework = Framework.LANGCHAIN;

  private originalCallbackManager: unknown = null;

  patch(): void {
    if (this.isPatched) return;

    const langchain = tryRequire("langchain");
    if (!langchain) {
      logger.warn("LangChain is not installed — skipping patch");
      return;
    }

    logger.debug("Patching LangChain for AgentQ integration");

    // Hook into LangChain's callback system.
    // In a full implementation, this would register a custom CallbackHandler
    // that emits AgentQ events for each LangChain lifecycle stage.
    // For now, we mark as patched and support manual wrapping.

    this.markPatched();
    logger.info("LangChain adapter patched successfully");
  }

  unpatch(): void {
    if (!this.isPatched) return;

    logger.debug("Unpatching LangChain adapter");

    if (this.originalCallbackManager) {
      // Restore original callback manager
      this.originalCallbackManager = null;
    }

    this.markUnpatched();
    logger.info("LangChain adapter unpatched");
  }

  wrapAgent<T>(agent: T, agentId?: string): T {
    const id = this.deriveAgentId(agent, agentId);
    this.wrappedAgents.set(id, agent);

    logger.debug(`Wrapped LangChain agent: ${id}`);

    // Create a proxy that intercepts invoke/run calls
    if (agent && typeof agent === "object") {
      return new Proxy(agent as object, {
        get: (target, prop, receiver) => {
          const value = Reflect.get(target, prop, receiver);

          // Intercept execution methods
          if (
            typeof value === "function" &&
            (prop === "invoke" || prop === "run" || prop === "call")
          ) {
            return (...args: unknown[]) => {
              const runId = this.generateRunId();
              this.emitEvent(AgentEvent.AGENT_START, id, runId, {
                method: String(prop),
                args: args.length,
              });

              try {
                const result = (value as (...a: unknown[]) => unknown).apply(target, args);

                // Handle promises
                if (result && typeof result === "object" && "then" in result) {
                  return (result as Promise<unknown>)
                    .then((res) => {
                      this.emitEvent(AgentEvent.AGENT_END, id, runId, { success: true });
                      return res;
                    })
                    .catch((err: Error) => {
                      this.emitEvent(AgentEvent.AGENT_ERROR, id, runId, {
                        error: err.message,
                      });
                      throw err;
                    });
                }

                this.emitEvent(AgentEvent.AGENT_END, id, runId, { success: true });
                return result;
              } catch (err) {
                this.emitEvent(AgentEvent.AGENT_ERROR, id, runId, {
                  error: err instanceof Error ? err.message : String(err),
                });
                throw err;
              }
            };
          }

          return value;
        },
      }) as T;
    }

    return agent;
  }
}
