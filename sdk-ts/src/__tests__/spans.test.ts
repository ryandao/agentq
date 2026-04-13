import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { trackLLM, trackTool, trackAgent, currentSpan } from "../spans.js";
import { shutdown } from "../tracer.js";
import { initTestTracer } from "./helpers.js";

describe("manual span helpers", () => {
  beforeEach(() => {
    initTestTracer();
  });

  afterEach(async () => {
    await shutdown();
  });

  describe("trackLLM", () => {
    it("should execute callback and return result (auto mode)", async () => {
      const result = await trackLLM(
        { model: "gpt-4o", provider: "openai" },
        async () => "response from llm",
      );
      expect(result).toBe("response from llm");
    });

    it("should return an AgentQSpan in manual mode", () => {
      const span = trackLLM({ model: "claude-3", provider: "anthropic" });
      expect(span).toBeDefined();
      expect(span.span).toBeDefined();
      expect(typeof span.setAttribute).toBe("function");
      expect(typeof span.recordError).toBe("function");
      expect(typeof span.end).toBe("function");
      span.end();
    });

    it("should propagate errors in auto mode", async () => {
      await expect(
        trackLLM({ model: "test" }, async () => {
          throw new Error("llm error");
        }),
      ).rejects.toThrow("llm error");
    });
  });

  describe("trackTool", () => {
    it("should execute callback and return result", async () => {
      const result = await trackTool(
        { name: "web-search", input: { query: "test" } },
        async () => ["result1", "result2"],
      );
      expect(result).toEqual(["result1", "result2"]);
    });

    it("should return an AgentQSpan in manual mode", () => {
      const span = trackTool({ name: "calculator" });
      expect(span).toBeDefined();
      span.end();
    });
  });

  describe("trackAgent", () => {
    it("should execute callback and return result", async () => {
      const result = await trackAgent(
        { name: "planner", description: "Plans tasks" },
        async () => ({ plan: "step1, step2" }),
      );
      expect(result).toEqual({ plan: "step1, step2" });
    });

    it("should return an AgentQSpan in manual mode", () => {
      const span = trackAgent({ name: "analyzer" });
      expect(span).toBeDefined();
      span.end();
    });
  });

  describe("currentSpan", () => {
    it("should return undefined when no span is active", () => {
      const span = currentSpan();
      expect(span).toBeUndefined();
    });

    it("should return the active span inside trackLLM", async () => {
      await trackLLM(
        { model: "test", provider: "test" },
        async () => {
          const span = currentSpan();
          expect(span).toBeDefined();
          span!.setAttribute("custom.key", "custom_value");
        },
      );
    });
  });
});
