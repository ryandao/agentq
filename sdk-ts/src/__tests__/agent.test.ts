import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { agent, Agent } from "../agent.js";
import { shutdown } from "../tracer.js";
import { initTestTracer } from "./helpers.js";

describe("agent() HOF", () => {
  beforeEach(() => {
    initTestTracer();
  });

  afterEach(async () => {
    await shutdown();
  });

  it("should wrap an async function and return its result", async () => {
    const myAgent = agent("test-agent", async (x: number) => {
      return x * 2;
    });
    const result = await myAgent(5);
    expect(result).toBe(10);
  });

  it("should wrap a sync function and return its result", async () => {
    const myAgent = agent("sync-agent", (x: number) => {
      return x + 1;
    });
    const result = await myAgent(3);
    expect(result).toBe(4);
  });

  it("should propagate errors from the wrapped function", async () => {
    const failingAgent = agent("failing", async () => {
      throw new Error("agent failed");
    });
    await expect(failingAgent()).rejects.toThrow("agent failed");
  });

  it("should preserve a meaningful function name", () => {
    const myAgent = agent("named-agent", async () => "result");
    expect(myAgent.name).toBe("agent:named-agent");
  });
});

describe("@Agent decorator", () => {
  beforeEach(() => {
    initTestTracer();
  });

  afterEach(async () => {
    await shutdown();
  });

  it("should decorate a class method and preserve functionality", async () => {
    class TestAgents {
      @Agent("researcher")
      async research(query: string) {
        return `Results for: ${query}`;
      }
    }
    const agents = new TestAgents();
    const result = await agents.research("quantum computing");
    expect(result).toBe("Results for: quantum computing");
  });

  it("should use property key as name when name is omitted", async () => {
    class TestAgents {
      @Agent()
      async myMethod() {
        return "done";
      }
    }
    const agents = new TestAgents();
    const result = await agents.myMethod();
    expect(result).toBe("done");
  });
});
