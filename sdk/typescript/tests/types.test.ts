import { describe, it, expect } from "vitest";
import {
  AGENT_FRAMEWORKS,
  AGENT_STATUSES,
  TASK_STATUSES,
  isAgentFramework,
  isAgentStatus,
  isTaskStatus,
  isAgent,
} from "../src/types/index.js";

describe("Type constants", () => {
  it("should export all agent frameworks", () => {
    expect(AGENT_FRAMEWORKS).toContain("langchain");
    expect(AGENT_FRAMEWORKS).toContain("crewai");
    expect(AGENT_FRAMEWORKS).toContain("autogen");
    expect(AGENT_FRAMEWORKS).toContain("openai");
    expect(AGENT_FRAMEWORKS).toContain("anthropic");
    expect(AGENT_FRAMEWORKS).toContain("custom");
    expect(AGENT_FRAMEWORKS).toHaveLength(6);
  });

  it("should export all agent statuses", () => {
    expect(AGENT_STATUSES).toContain("active");
    expect(AGENT_STATUSES).toContain("inactive");
    expect(AGENT_STATUSES).toContain("error");
    expect(AGENT_STATUSES).toContain("pending");
    expect(AGENT_STATUSES).toHaveLength(4);
  });

  it("should export all task statuses", () => {
    expect(TASK_STATUSES).toContain("pending");
    expect(TASK_STATUSES).toContain("running");
    expect(TASK_STATUSES).toContain("completed");
    expect(TASK_STATUSES).toContain("failed");
    expect(TASK_STATUSES).toHaveLength(4);
  });

  it("should be readonly arrays (as const)", () => {
    // `as const` makes these readonly at the type level.
    // Verify they are arrays with expected structure.
    expect(Array.isArray(AGENT_FRAMEWORKS)).toBe(true);
    expect(Array.isArray(AGENT_STATUSES)).toBe(true);
    expect(Array.isArray(TASK_STATUSES)).toBe(true);
  });
});

describe("isAgentFramework", () => {
  it("should return true for valid frameworks", () => {
    for (const fw of AGENT_FRAMEWORKS) {
      expect(isAgentFramework(fw)).toBe(true);
    }
  });

  it("should return false for invalid values", () => {
    expect(isAgentFramework("invalid")).toBe(false);
    expect(isAgentFramework("")).toBe(false);
    expect(isAgentFramework(123)).toBe(false);
    expect(isAgentFramework(null)).toBe(false);
    expect(isAgentFramework(undefined)).toBe(false);
    expect(isAgentFramework({})).toBe(false);
  });
});

describe("isAgentStatus", () => {
  it("should return true for valid statuses", () => {
    for (const status of AGENT_STATUSES) {
      expect(isAgentStatus(status)).toBe(true);
    }
  });

  it("should return false for invalid values", () => {
    expect(isAgentStatus("unknown")).toBe(false);
    expect(isAgentStatus("")).toBe(false);
    expect(isAgentStatus(42)).toBe(false);
    expect(isAgentStatus(null)).toBe(false);
  });
});

describe("isTaskStatus", () => {
  it("should return true for valid statuses", () => {
    for (const status of TASK_STATUSES) {
      expect(isTaskStatus(status)).toBe(true);
    }
  });

  it("should return false for invalid values", () => {
    expect(isTaskStatus("cancelled")).toBe(false);
    expect(isTaskStatus(true)).toBe(false);
  });
});

describe("isAgent", () => {
  const validAgent = {
    id: "agent-1",
    name: "test-agent",
    status: "active",
    capabilities: ["chat"],
    tags: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("should return true for a valid agent object", () => {
    expect(isAgent(validAgent)).toBe(true);
  });

  it("should return true for agent with optional fields", () => {
    expect(
      isAgent({
        ...validAgent,
        description: "A test agent",
        version: "1.0.0",
        framework: "langchain",
      })
    ).toBe(true);
  });

  it("should return false for null/undefined", () => {
    expect(isAgent(null)).toBe(false);
    expect(isAgent(undefined)).toBe(false);
  });

  it("should return false for non-objects", () => {
    expect(isAgent("string")).toBe(false);
    expect(isAgent(123)).toBe(false);
    expect(isAgent(true)).toBe(false);
  });

  it("should return false if id is missing", () => {
    const { id: _, ...noId } = validAgent;
    expect(isAgent(noId)).toBe(false);
  });

  it("should return false if status is invalid", () => {
    expect(isAgent({ ...validAgent, status: "unknown" })).toBe(false);
  });

  it("should return false if capabilities is not an array", () => {
    expect(isAgent({ ...validAgent, capabilities: "chat" })).toBe(false);
  });

  it("should return false if createdAt is missing", () => {
    const { createdAt: _, ...noCreated } = validAgent;
    expect(isAgent(noCreated)).toBe(false);
  });
});
