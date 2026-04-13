import { describe, it, expect, afterEach } from "vitest";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import {
  init,
  instrument,
  shutdown,
  flush,
  agent,
  session,
  trackLLM,
  trackTool,
  trackAgent,
  currentSpan,
  isInitialized,
  AgentQAttributes,
  SpanType,
} from "../index.js";

describe("public API", () => {
  afterEach(async () => {
    await shutdown();
  });

  it("should export all expected functions", () => {
    expect(typeof init).toBe("function");
    expect(typeof instrument).toBe("function");
    expect(typeof shutdown).toBe("function");
    expect(typeof flush).toBe("function");
    expect(typeof agent).toBe("function");
    expect(typeof session).toBe("function");
    expect(typeof trackLLM).toBe("function");
    expect(typeof trackTool).toBe("function");
    expect(typeof trackAgent).toBe("function");
    expect(typeof currentSpan).toBe("function");
    expect(typeof isInitialized).toBe("function");
  });

  it("should export AgentQAttributes constants", () => {
    expect(AgentQAttributes.SESSION_ID).toBe("agentq.session.id");
    expect(AgentQAttributes.AGENT_NAME).toBe("agentq.agent.name");
    expect(AgentQAttributes.LLM_MODEL).toBe("gen_ai.request.model");
    expect(AgentQAttributes.TOOL_NAME).toBe("agentq.tool.name");
  });

  it("should export SpanType enum", () => {
    expect(SpanType.AGENT).toBe("agent");
    expect(SpanType.LLM).toBe("llm");
    expect(SpanType.TOOL).toBe("tool");
    expect(SpanType.SESSION).toBe("session");
  });

  it("init() should initialize the SDK", () => {
    expect(isInitialized()).toBe(false);
    init({ serviceName: "test-app", _exporter: new InMemorySpanExporter() });
    expect(isInitialized()).toBe(true);
  });

  it("instrument() should throw if init() not called", () => {
    expect(() => instrument()).toThrow("AgentQ SDK not initialized");
  });

  it("instrument() should return patching results after init", () => {
    init({ _exporter: new InMemorySpanExporter() });
    const result = instrument();
    expect(result).toHaveProperty("openai");
    expect(result).toHaveProperty("anthropic");
    expect(result).toHaveProperty("vercelAI");
  });

  it("full e2e: init → agent → session → trackLLM", async () => {
    init({ serviceName: "e2e-test", _exporter: new InMemorySpanExporter() });

    const myAgent = agent("test-e2e", async (input: string) => {
      return await trackLLM(
        { model: "test-model", provider: "test" },
        async () => `processed: ${input}`,
      );
    });

    const result = await session(
      { sessionId: "e2e_sess", userId: "e2e_user" },
      async () => myAgent("hello world"),
    );

    expect(result).toBe("processed: hello world");
  });
});
