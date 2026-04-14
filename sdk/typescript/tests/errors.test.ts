import { describe, it, expect } from "vitest";
import {
  AgentQError,
  AgentQApiError,
  AgentQConfigError,
  AgentQNetworkError,
  AgentQTimeoutError,
  AgentNotFoundError,
} from "../src/errors.js";

describe("Error classes", () => {
  it("AgentQError should have name and code", () => {
    const err = new AgentQError("test error", "TEST_CODE");
    expect(err.message).toBe("test error");
    expect(err.code).toBe("TEST_CODE");
    expect(err.name).toBe("AgentQError");
    expect(err).toBeInstanceOf(Error);
  });

  it("AgentQApiError should contain status and details", () => {
    const err = new AgentQApiError({
      statusCode: 400,
      message: "Bad request",
      code: "BAD_REQUEST",
      details: { field: "name" },
    });
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("Bad request");
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.details).toEqual({ field: "name" });
    expect(err).toBeInstanceOf(AgentQError);
  });

  it("AgentQConfigError should have CONFIG_ERROR code", () => {
    const err = new AgentQConfigError("missing apiKey");
    expect(err.code).toBe("CONFIG_ERROR");
    expect(err.name).toBe("AgentQConfigError");
  });

  it("AgentQNetworkError should wrap cause", () => {
    const cause = new Error("ECONNREFUSED");
    const err = new AgentQNetworkError("connection failed", cause);
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.cause).toBe(cause);
  });

  it("AgentQTimeoutError should include timeout duration", () => {
    const err = new AgentQTimeoutError(5000);
    expect(err.message).toContain("5000ms");
    expect(err.code).toBe("TIMEOUT");
  });

  it("AgentNotFoundError should include agent ID", () => {
    const err = new AgentNotFoundError("agent-123");
    expect(err.message).toContain("agent-123");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("AGENT_NOT_FOUND");
  });
});
