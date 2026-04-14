import { describe, it, expect, beforeEach } from "vitest";
import { agent, getAgentMetadata, AGENT_METADATA_KEY } from "../src/decorators/index.js";
import { AgentRegistry } from "../src/registry.js";

describe("@agent decorator", () => {
  beforeEach(() => {
    AgentRegistry.resetInstance();
  });

  it("should attach metadata to a decorated class", () => {
    @agent({ name: "TestBot", description: "A test bot" })
    class TestBot {
      async run(input: string): Promise<string> {
        return `Echo: ${input}`;
      }
    }

    const metadata = getAgentMetadata(TestBot);
    expect(metadata).toBeDefined();
    expect(metadata?.name).toBe("TestBot");
    expect(metadata?.description).toBe("A test bot");
  });

  it("should use class name if name is not provided", () => {
    @agent({})
    class MyAgent {
      async run(): Promise<void> {}
    }

    const metadata = getAgentMetadata(MyAgent);
    expect(metadata?.name).toBe("MyAgent");
  });

  it("should register agent in the global registry by default", () => {
    @agent({ name: "AutoRegistered" })
    class _AutoRegistered {
      async run(): Promise<void> {}
    }

    const registry = AgentRegistry.getInstance();
    expect(registry.has("AutoRegistered")).toBe(true);
  });

  it("should NOT register if autoRegister is false", () => {
    @agent({ name: "ManualOnly", autoRegister: false })
    class _ManualOnly {
      async run(): Promise<void> {}
    }

    const registry = AgentRegistry.getInstance();
    expect(registry.has("ManualOnly")).toBe(false);
  });

  it("should preserve all decorator options as metadata", () => {
    @agent({
      name: "FullAgent",
      description: "Fully configured agent",
      version: "2.1.0",
      framework: "openai",
      capabilities: ["chat", "code", "search"],
    })
    class _FullAgent {
      async run(): Promise<void> {}
    }

    const metadata = getAgentMetadata(_FullAgent);
    expect(metadata).toEqual({
      name: "FullAgent",
      description: "Fully configured agent",
      version: "2.1.0",
      framework: "openai",
      capabilities: ["chat", "code", "search"],
    });
  });

  it("should make metadata non-writable", () => {
    @agent({ name: "Immutable" })
    class ImmutableAgent {
      async run(): Promise<void> {}
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      ImmutableAgent,
      AGENT_METADATA_KEY
    );
    expect(descriptor?.writable).toBe(false);
  });

  it("should return undefined for non-decorated classes", () => {
    class PlainClass {}
    const metadata = getAgentMetadata(PlainClass);
    expect(metadata).toBeUndefined();
  });
});
