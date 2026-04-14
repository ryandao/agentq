import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentRegistry } from "../src/registry.js";
import type { AgentMetadata, Agent } from "../src/types/index.js";

// Mock fetch for syncAll tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(data),
  };
}

describe("AgentRegistry events", () => {
  beforeEach(() => {
    AgentRegistry.resetInstance();
    mockFetch.mockReset();
  });

  describe("on('registered')", () => {
    it("should fire when an agent is registered", () => {
      const registry = AgentRegistry.getInstance();
      const listener = vi.fn();

      registry.on("registered", listener);
      registry.register({ name: "test-agent" });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith({ name: "test-agent" });
    });

    it("should fire for each registration", () => {
      const registry = AgentRegistry.getInstance();
      const listener = vi.fn();

      registry.on("registered", listener);
      registry.register({ name: "agent-1" });
      registry.register({ name: "agent-2" });

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("should support multiple listeners", () => {
      const registry = AgentRegistry.getInstance();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      registry.on("registered", listener1);
      registry.on("registered", listener2);
      registry.register({ name: "agent" });

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();
    });
  });

  describe("on('unregistered')", () => {
    it("should fire when an agent is unregistered", () => {
      const registry = AgentRegistry.getInstance();
      const listener = vi.fn();

      registry.register({ name: "to-remove" });
      registry.on("unregistered", listener);
      registry.unregister("to-remove");

      expect(listener).toHaveBeenCalledWith("to-remove");
    });

    it("should NOT fire when unregistering a non-existent agent", () => {
      const registry = AgentRegistry.getInstance();
      const listener = vi.fn();

      registry.on("unregistered", listener);
      registry.unregister("non-existent");

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("on('synced')", () => {
    it("should fire after syncAll completes", async () => {
      const registry = AgentRegistry.getInstance();
      const listener = vi.fn();

      const agentResponse: Agent = {
        id: "agent-1",
        name: "test-agent",
        status: "active",
        capabilities: [],
        tags: {},
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValue(mockResponse(agentResponse));

      registry.register({ name: "test-agent" });
      registry.on("synced", listener);

      await registry.syncAll({
        baseUrl: "https://api.agentq.dev",
        apiKey: "test-key",
      });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith([agentResponse]);
    });
  });

  describe("unsubscribe", () => {
    it("on() should return an unsubscribe function", () => {
      const registry = AgentRegistry.getInstance();
      const listener = vi.fn();

      const unsubscribe = registry.on("registered", listener);
      registry.register({ name: "before" });
      expect(listener).toHaveBeenCalledOnce();

      unsubscribe();
      registry.register({ name: "after" });
      expect(listener).toHaveBeenCalledOnce(); // not called again
    });
  });

  describe("off()", () => {
    it("should remove a specific listener", () => {
      const registry = AgentRegistry.getInstance();
      const listener = vi.fn();

      registry.on("registered", listener);
      registry.off("registered", listener);
      registry.register({ name: "test" });

      expect(listener).not.toHaveBeenCalled();
    });

    it("should not throw when removing a non-existent listener", () => {
      const registry = AgentRegistry.getInstance();
      expect(() => registry.off("registered", vi.fn())).not.toThrow();
    });
  });
});
