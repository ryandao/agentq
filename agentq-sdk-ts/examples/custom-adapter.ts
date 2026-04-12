/**
 * Custom adapter example — shows how to extend the SDK
 * with a custom framework adapter.
 */

import { AgentQ, Framework, AgentEvent } from "@agentq/sdk";
import { BaseAdapter } from "@agentq/sdk/adapters";

/**
 * Example: A custom adapter for a hypothetical "MyFramework" agent system.
 * You can register custom adapters to extend AgentQ's framework support.
 */
class MyFrameworkAdapter extends BaseAdapter {
  readonly framework = "myframework" as Framework;

  patch(): void {
    if (this.isPatched) return;
    console.log("Patching MyFramework...");
    // Hook into your framework's internals here
    this.markPatched();
  }

  unpatch(): void {
    if (!this.isPatched) return;
    console.log("Unpatching MyFramework...");
    this.markUnpatched();
  }

  wrapAgent<T>(agent: T, agentId?: string): T {
    const id = this.deriveAgentId(agent, agentId);
    this.wrappedAgents.set(id, agent);

    if (agent && typeof agent === "object") {
      return new Proxy(agent as object, {
        get: (target, prop, receiver) => {
          const value = Reflect.get(target, prop, receiver);

          if (typeof value === "function" && prop === "execute") {
            return (...args: unknown[]) => {
              const runId = this.generateRunId();
              this.emitEvent(AgentEvent.AGENT_START, id, runId);

              try {
                const result = (value as Function).apply(target, args);
                this.emitEvent(AgentEvent.AGENT_END, id, runId, { success: true });
                return result;
              } catch (err) {
                this.emitEvent(AgentEvent.AGENT_ERROR, id, runId, {
                  error: String(err),
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

// Register the custom adapter
const agentq = new AgentQ({ autoPatch: false });
const registry = agentq.getRegistry();
registry.registerFactory(
  "myframework" as Framework,
  () => new MyFrameworkAdapter(),
);

// Now you can use it like any built-in adapter
const adapter = registry.get("myframework" as Framework);
adapter.patch();

console.log("Custom adapter registered and patched!");
agentq.destroy();
