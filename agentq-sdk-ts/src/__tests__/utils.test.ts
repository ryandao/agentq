import { describe, it, expect } from "vitest";
import { generateRunId, deriveAgentId } from "../utils.js";

describe("generateRunId", () => {
  it("should return a valid UUID string", () => {
    const id = generateRunId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("should return unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRunId()));
    expect(ids.size).toBe(100);
  });
});

describe("deriveAgentId", () => {
  it("should use provided ID if given", () => {
    const id = deriveAgentId({}, "custom-id");
    expect(id).toBe("custom-id");
  });

  it("should use name attribute if available", () => {
    const id = deriveAgentId({ name: "my-agent" });
    expect(id).toBe("my-agent");
  });

  it("should use agentName attribute", () => {
    const id = deriveAgentId({ agentName: "test-agent" });
    expect(id).toBe("test-agent");
  });

  it("should use id attribute", () => {
    const id = deriveAgentId({ id: "agent-123" });
    expect(id).toBe("agent-123");
  });

  it("should use constructor name as fallback", () => {
    class MyCustomAgent {}
    const id = deriveAgentId(new MyCustomAgent());
    expect(id).toMatch(/^MyCustomAgent-[0-9a-f]{8}$/);
  });

  it("should generate a random ID for plain objects", () => {
    const id = deriveAgentId({});
    expect(id).toMatch(/^agent-[0-9a-f]{8}$/);
  });

  it("should handle null/undefined gracefully", () => {
    const id = deriveAgentId(null);
    expect(id).toMatch(/^agent-[0-9a-f]{8}$/);
  });
});
