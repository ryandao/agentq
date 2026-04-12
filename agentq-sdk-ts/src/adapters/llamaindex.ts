/**
 * LlamaIndex adapter for AgentQ.
 *
 * Hooks into LlamaIndex's agent execution to intercept lifecycle events.
 */

import { Framework, AgentEvent } from "../types.js";
import { BaseAdapter } from "./base.js";
import { tryRequire } from "../utils.js";
import { logger } from "../logger.js";

export class LlamaIndexAdapter extends BaseAdapter {
  readonly framework = Framework.LLAMAINDEX;

  patch(): void {
    if (this.isPatched) return;

    const llamaindex = tryRequire("llamaindex");
    if (!llamaindex) {
      logger.warn("LlamaIndex is not installed — skipping patch");
      return;
    }

    logger.debug("Patching LlamaIndex for AgentQ integration");
    this.markPatched();
    logger.info("LlamaIndex adapter patched successfully");
  }

  unpatch(): void {
    if (!this.isPatched) return;
    logger.debug("Unpatching LlamaIndex adapter");
    this.markUnpatched();
    logger.info("LlamaIndex adapter unpatched");
  }

  wrapAgent<T>(agent: T, agentId?: string): T {
    const id = this.deriveAgentId(agent, agentId);
    this.wrappedAgents.set(id, agent);
    logger.debug(`Wrapped LlamaIndex agent: ${id}`);

    if (agent && typeof agent === "object") {
      return new Proxy(agent as object, {
        get: (target, prop, receiver) => {
          const value = Reflect.get(target, prop, receiver);

          if (
            typeof value === "function" &&
            (prop === "chat" || prop === "query" || prop === "run")
          ) {
            return (...args: unknown[]) => {
              const runId = this.generateRunId();
              this.emitEvent(AgentEvent.AGENT_START, id, runId, {
                method: String(prop),
              });

              try {
                const result = (value as (...a: unknown[]) => unknown).apply(target, args);

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
