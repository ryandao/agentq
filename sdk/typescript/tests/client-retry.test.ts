import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentQClient } from "../src/client/index.js";
import { AgentQApiError, AgentQNetworkError } from "../src/errors.js";
import type { Agent } from "../src/types/index.js";

// Mock fetch globally
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

const agentData: Agent = {
  id: "agent-1",
  name: "test-agent",
  status: "active",
  capabilities: ["chat"],
  tags: {},
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("AgentQClient retry", () => {
  const config = {
    baseUrl: "https://api.agentq.dev",
    apiKey: "test-api-key",
    retry: {
      maxRetries: 2,
      baseDelay: 10, // Fast for tests
      maxDelay: 100,
    },
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should succeed on first try with no retries needed", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(agentData));

    const client = new AgentQClient(config);
    const result = await client.getAgent("agent-1");

    expect(result).toEqual(agentData);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should retry on 500 and succeed", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockResponse({ message: "Internal error" }, 500)
      )
      .mockResolvedValueOnce(mockResponse(agentData));

    const client = new AgentQClient(config);
    const result = await client.getAgent("agent-1");

    expect(result).toEqual(agentData);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should retry on 429 (rate limit) and succeed", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockResponse({ message: "Rate limited" }, 429)
      )
      .mockResolvedValueOnce(mockResponse(agentData));

    const client = new AgentQClient(config);
    const result = await client.getAgent("agent-1");

    expect(result).toEqual(agentData);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should retry on 502/503/504 and succeed", async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({ message: "Bad Gateway" }, 502))
      .mockResolvedValueOnce(
        mockResponse({ message: "Service Unavailable" }, 503)
      )
      .mockResolvedValueOnce(mockResponse(agentData));

    const client = new AgentQClient(config);
    const result = await client.getAgent("agent-1");

    expect(result).toEqual(agentData);
    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("should exhaust retries and throw the last error", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({ message: "Server Error" }, 500)
    );

    const client = new AgentQClient(config);
    await expect(client.getAgent("agent-1")).rejects.toThrow(AgentQApiError);
    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("should NOT retry on 400 (non-retryable status)", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ message: "Bad request" }, 400)
    );

    const client = new AgentQClient(config);
    await expect(client.getAgent("agent-1")).rejects.toThrow(AgentQApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1); // no retry
  });

  it("should NOT retry on 404 (non-retryable status)", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ message: "Not found" }, 404)
    );

    const client = new AgentQClient(config);
    await expect(client.getAgent("agent-1")).rejects.toThrow(AgentQApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should retry on network errors", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(mockResponse(agentData));

    const client = new AgentQClient(config);
    const result = await client.getAgent("agent-1");

    expect(result).toEqual(agentData);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should not retry when retry config is not provided", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ message: "Server Error" }, 500)
    );

    const client = new AgentQClient({
      baseUrl: "https://api.agentq.dev",
      apiKey: "test-api-key",
      // No retry config
    });

    await expect(client.getAgent("agent-1")).rejects.toThrow(AgentQApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should support custom retryable statuses", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockResponse({ message: "Conflict" }, 409)
      )
      .mockResolvedValueOnce(mockResponse(agentData));

    const client = new AgentQClient({
      ...config,
      retry: {
        maxRetries: 1,
        baseDelay: 10,
        retryableStatuses: [409], // Custom: retry on 409
      },
    });

    const result = await client.getAgent("agent-1");
    expect(result).toEqual(agentData);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("AgentQClient hooks", () => {
  const config = {
    baseUrl: "https://api.agentq.dev",
    apiKey: "test-api-key",
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("onRequest hook should be called before each request", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(agentData));

    const hook = vi.fn();
    const client = new AgentQClient(config);
    client.onRequest(hook);

    await client.getAgent("agent-1");

    expect(hook).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledWith(
      "GET",
      "https://api.agentq.dev/api/v1/agents/agent-1",
      expect.objectContaining({ Authorization: "Bearer test-api-key" })
    );
  });

  it("onRequest hook can modify headers", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(agentData));

    const client = new AgentQClient(config);
    client.onRequest((_method, _url, headers) => {
      return { ...headers, "X-Custom": "value" };
    });

    await client.getAgent("agent-1");

    const [, fetchOptions] = mockFetch.mock.calls[0];
    expect(fetchOptions.headers["X-Custom"]).toBe("value");
  });

  it("onResponse hook should be called after each response", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(agentData));

    const hook = vi.fn();
    const client = new AgentQClient(config);
    client.onResponse(hook);

    await client.getAgent("agent-1");

    expect(hook).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledWith(
      "GET",
      "https://api.agentq.dev/api/v1/agents/agent-1",
      200,
      expect.any(Number)
    );
  });

  it("onResponse hook should report error status codes", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ message: "Not found" }, 404)
    );

    const hook = vi.fn();
    const client = new AgentQClient(config);
    client.onResponse(hook);

    await expect(client.getAgent("missing")).rejects.toThrow();

    expect(hook).toHaveBeenCalledWith(
      "GET",
      expect.any(String),
      404,
      expect.any(Number)
    );
  });

  it("should support chaining onRequest and onResponse", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(agentData));

    const requestHook = vi.fn();
    const responseHook = vi.fn();

    const client = new AgentQClient(config)
      .onRequest(requestHook)
      .onResponse(responseHook);

    await client.getAgent("agent-1");

    expect(requestHook).toHaveBeenCalledOnce();
    expect(responseHook).toHaveBeenCalledOnce();
  });

  it("should support multiple hooks", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(agentData));

    const hook1 = vi.fn();
    const hook2 = vi.fn();

    const client = new AgentQClient(config);
    client.onRequest(hook1);
    client.onRequest(hook2);

    await client.getAgent("agent-1");

    expect(hook1).toHaveBeenCalledOnce();
    expect(hook2).toHaveBeenCalledOnce();
  });
});
