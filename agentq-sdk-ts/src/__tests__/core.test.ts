import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AgentQ, autoIntegrate } from "../core.js";
import { Framework, type EventPayload, AgentEvent } from "../types.js";

describe("AgentQ", () => {
  let agentq: AgentQ;

  beforeEach(() => {
    agentq = new AgentQ({ debug: false });
  });

  afterEach(() => {
    agentq.destroy();
  });

  it("should initialize without errors", () => {
    const detected = agentq.init();
    expect(Array.isArray(detected)).toBe(true);
  });

  it("should warn on double init", () => {
    agentq.init();
    const second = agentq.init();
    expect(second).toEqual([]);
  });

  it("should expose the detector", () => {
    expect(agentq.getDetector()).toBeDefined();
  });

  it("should expose the registry", () => {
    expect(agentq.getRegistry()).toBeDefined();
  });

  it("should register event handlers", () => {
    const events: EventPayload[] = [];
    agentq.onEvent((payload) => events.push(payload));

    // Manually trigger through an adapter
    const adapter = agentq.getAdapter(Framework.LANGCHAIN);
    expect(adapter).toBeDefined();
  });

  it("should wrap agents", () => {
    const fakeAgent = { name: "test-agent", invoke: () => "result" };
    const wrapped = agentq.wrap(fakeAgent, Framework.LANGCHAIN, "my-agent");
    expect(wrapped).toBeDefined();
    expect(agentq.getAgents()).toHaveLength(1);
    expect(agentq.getAgents()[0]!.id).toBe("my-agent");
  });

  it("should track wrapped agent events", () => {
    const events: EventPayload[] = [];
    agentq.onEvent((payload) => events.push(payload));

    // Get the adapter and manually patch
    const adapter = agentq.getAdapter(Framework.LANGCHAIN);
    adapter.onEvent((payload) => events.push(payload));

    const fakeAgent = {
      name: "test",
      invoke: () => "hello",
    };

    const wrapped = adapter.wrapAgent(fakeAgent, "test-agent");
    wrapped.invoke();

    // Should have received AGENT_START and AGENT_END events
    const agentEvents = events.filter((e) => e.agentId === "test-agent");
    expect(agentEvents.length).toBeGreaterThanOrEqual(2);
    expect(agentEvents[0]!.event).toBe(AgentEvent.AGENT_START);
    expect(agentEvents[1]!.event).toBe(AgentEvent.AGENT_END);
  });

  it("should emit AGENT_ERROR when agent throws", () => {
    const events: EventPayload[] = [];

    const adapter = agentq.getAdapter(Framework.LANGCHAIN);
    adapter.onEvent((payload) => events.push(payload));

    const fakeAgent = {
      name: "failing-agent",
      invoke: () => {
        throw new Error("test error");
      },
    };

    const wrapped = adapter.wrapAgent(fakeAgent, "fail-agent");
    expect(() => wrapped.invoke()).toThrow("test error");

    const errorEvents = events.filter((e) => e.event === AgentEvent.AGENT_ERROR);
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]!.data.error).toBe("test error");
  });

  it("should handle async agent methods", async () => {
    const events: EventPayload[] = [];

    const adapter = agentq.getAdapter(Framework.LANGCHAIN);
    adapter.onEvent((payload) => events.push(payload));

    const fakeAgent = {
      name: "async-agent",
      invoke: async () => {
        return "async result";
      },
    };

    const wrapped = adapter.wrapAgent(fakeAgent, "async-test");
    const result = await wrapped.invoke();
    expect(result).toBe("async result");

    const agentEvents = events.filter((e) => e.agentId === "async-test");
    expect(agentEvents).toHaveLength(2);
    expect(agentEvents[0]!.event).toBe(AgentEvent.AGENT_START);
    expect(agentEvents[1]!.event).toBe(AgentEvent.AGENT_END);
  });

  it("should clean up on destroy", () => {
    agentq.init();
    agentq.wrap({ name: "test" }, Framework.LANGCHAIN);
    agentq.destroy();
    expect(agentq.getAgents()).toHaveLength(0);
  });
});

describe("autoIntegrate", () => {
  it("should return an initialized AgentQ instance", () => {
    const agentq = autoIntegrate({ debug: false });
    expect(agentq).toBeInstanceOf(AgentQ);
    expect(agentq.getDetector()).toBeDefined();
    agentq.destroy();
  });

  it("should accept a custom event handler", () => {
    const handler = vi.fn();
    const agentq = autoIntegrate({ onEvent: handler, debug: false });
    expect(agentq).toBeInstanceOf(AgentQ);
    agentq.destroy();
  });
});
