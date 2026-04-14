import { describe, it, expect, beforeEach } from "vitest";
import { AgentRegistry } from "../src/registry.js";
import type { AgentMetadata } from "../src/types/index.js";

describe("AgentRegistry", () => {
  beforeEach(() => {
    AgentRegistry.resetInstance();
  });

  it("should return the same singleton instance", () => {
    const a = AgentRegistry.getInstance();
    const b = AgentRegistry.getInstance();
    expect(a).toBe(b);
  });

  it("should register an agent", () => {
    const registry = AgentRegistry.getInstance();
    const metadata: AgentMetadata = {
      name: "test-agent",
      description: "A test agent",
      version: "1.0.0",
      framework: "langchain",
      capabilities: ["chat"],
    };

    registry.register(metadata);
    expect(registry.has("test-agent")).toBe(true);
    expect(registry.get("test-agent")).toEqual(metadata);
    expect(registry.size).toBe(1);
  });

  it("should overwrite an agent with the same name", () => {
    const registry = AgentRegistry.getInstance();
    registry.register({ name: "agent", version: "1.0.0" });
    registry.register({ name: "agent", version: "2.0.0" });

    expect(registry.size).toBe(1);
    expect(registry.get("agent")?.version).toBe("2.0.0");
  });

  it("should unregister an agent", () => {
    const registry = AgentRegistry.getInstance();
    registry.register({ name: "agent-to-remove" });

    expect(registry.unregister("agent-to-remove")).toBe(true);
    expect(registry.has("agent-to-remove")).toBe(false);
    expect(registry.size).toBe(0);
  });

  it("should return false when unregistering a non-existent agent", () => {
    const registry = AgentRegistry.getInstance();
    expect(registry.unregister("non-existent")).toBe(false);
  });

  it("should list all registered agents", () => {
    const registry = AgentRegistry.getInstance();
    registry.register({ name: "agent-1" });
    registry.register({ name: "agent-2" });
    registry.register({ name: "agent-3" });

    const all = registry.getAll();
    expect(all).toHaveLength(3);
    expect(all.map((a) => a.name).sort()).toEqual([
      "agent-1",
      "agent-2",
      "agent-3",
    ]);
  });

  it("should clear all agents", () => {
    const registry = AgentRegistry.getInstance();
    registry.register({ name: "agent-1" });
    registry.register({ name: "agent-2" });
    registry.clear();

    expect(registry.size).toBe(0);
    expect(registry.getAll()).toEqual([]);
  });

  it("should reset the singleton instance", () => {
    const registry = AgentRegistry.getInstance();
    registry.register({ name: "persisted-agent" });

    AgentRegistry.resetInstance();
    const fresh = AgentRegistry.getInstance();

    expect(fresh.size).toBe(0);
    expect(fresh.has("persisted-agent")).toBe(false);
  });
});
