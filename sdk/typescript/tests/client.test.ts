import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentQClient } from "../src/client/index.js";
import { AgentQConfigError, AgentQApiError } from "../src/errors.js";
import type { Agent, PaginatedResponse } from "../src/types/index.js";

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

describe("AgentQClient", () => {
  const config = {
    baseUrl: "https://api.agentq.dev",
    apiKey: "test-api-key",
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("constructor", () => {
    it("should throw if baseUrl is missing", () => {
      expect(
        () => new AgentQClient({ baseUrl: "", apiKey: "key" })
      ).toThrow(AgentQConfigError);
    });

    it("should throw if apiKey is missing", () => {
      expect(
        () => new AgentQClient({ baseUrl: "http://localhost", apiKey: "" })
      ).toThrow(AgentQConfigError);
    });

    it("should create a valid client with proper config", () => {
      const client = new AgentQClient(config);
      expect(client).toBeDefined();
    });
  });

  describe("registerAgent", () => {
    it("should POST to /api/v1/agents", async () => {
      const agentData: Agent = {
        id: "agent-1",
        name: "test-agent",
        description: "A test agent",
        status: "active",
        capabilities: ["chat"],
        tags: {},
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce(mockResponse(agentData));

      const client = new AgentQClient(config);
      const result = await client.registerAgent({
        name: "test-agent",
        description: "A test agent",
        capabilities: ["chat"],
      });

      expect(result).toEqual(agentData);
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.agentq.dev/api/v1/agents");
      expect(options.method).toBe("POST");
      expect(options.headers.Authorization).toBe("Bearer test-api-key");
      expect(JSON.parse(options.body)).toEqual({
        name: "test-agent",
        description: "A test agent",
        capabilities: ["chat"],
      });
    });
  });

  describe("getAgent", () => {
    it("should GET /api/v1/agents/:id", async () => {
      const agentData: Agent = {
        id: "agent-1",
        name: "my-agent",
        status: "active",
        capabilities: [],
        tags: {},
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce(mockResponse(agentData));

      const client = new AgentQClient(config);
      const result = await client.getAgent("agent-1");

      expect(result).toEqual(agentData);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.agentq.dev/api/v1/agents/agent-1");
    });
  });

  describe("listAgents", () => {
    it("should GET /api/v1/agents with query params", async () => {
      const page: PaginatedResponse<Agent> = {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      };

      mockFetch.mockResolvedValueOnce(mockResponse(page));

      const client = new AgentQClient(config);
      const result = await client.listAgents({
        page: 1,
        pageSize: 20,
        status: "active",
        framework: "langchain",
        search: "bot",
      });

      expect(result).toEqual(page);
      const [url] = mockFetch.mock.calls[0];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get("page")).toBe("1");
      expect(parsedUrl.searchParams.get("pageSize")).toBe("20");
      expect(parsedUrl.searchParams.get("status")).toBe("active");
      expect(parsedUrl.searchParams.get("framework")).toBe("langchain");
      expect(parsedUrl.searchParams.get("search")).toBe("bot");
    });
  });

  describe("updateAgent", () => {
    it("should PATCH /api/v1/agents/:id", async () => {
      const updatedAgent: Agent = {
        id: "agent-1",
        name: "updated-agent",
        status: "active",
        capabilities: [],
        tags: {},
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce(mockResponse(updatedAgent));

      const client = new AgentQClient(config);
      const result = await client.updateAgent("agent-1", {
        name: "updated-agent",
      });

      expect(result).toEqual(updatedAgent);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.agentq.dev/api/v1/agents/agent-1");
      expect(options.method).toBe("PATCH");
    });
  });

  describe("deleteAgent", () => {
    it("should DELETE /api/v1/agents/:id", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(undefined, 204));

      const client = new AgentQClient(config);
      await client.deleteAgent("agent-1");

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.agentq.dev/api/v1/agents/agent-1");
      expect(options.method).toBe("DELETE");
    });
  });

  describe("heartbeat", () => {
    it("should POST heartbeat", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(undefined, 204));

      const client = new AgentQClient(config);
      await client.heartbeat({
        agentId: "agent-1",
        status: "active",
        metadata: { uptime: 3600 },
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://api.agentq.dev/api/v1/agents/agent-1/heartbeat"
      );
      expect(options.method).toBe("POST");
    });
  });

  describe("tasks", () => {
    it("should get next task", async () => {
      const task = {
        id: "task-1",
        agentId: "agent-1",
        input: "Do something",
        status: "pending",
        createdAt: "2026-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce(mockResponse(task));

      const client = new AgentQClient(config);
      const result = await client.getNextTask("agent-1");

      expect(result).toEqual(task);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://api.agentq.dev/api/v1/agents/agent-1/tasks/next"
      );
    });

    it("should submit task result", async () => {
      const completedTask = {
        id: "task-1",
        agentId: "agent-1",
        input: "Do something",
        output: "Done",
        status: "completed",
        createdAt: "2026-01-01T00:00:00Z",
        completedAt: "2026-01-01T00:01:00Z",
      };

      mockFetch.mockResolvedValueOnce(mockResponse(completedTask));

      const client = new AgentQClient(config);
      const result = await client.submitTaskResult(
        "agent-1",
        "task-1",
        "Done"
      );

      expect(result.status).toBe("completed");
      expect(result.output).toBe("Done");
    });

    it("should report task failure", async () => {
      const failedTask = {
        id: "task-1",
        agentId: "agent-1",
        input: "Do something",
        status: "failed",
        createdAt: "2026-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce(mockResponse(failedTask));

      const client = new AgentQClient(config);
      const result = await client.reportTaskFailure(
        "agent-1",
        "task-1",
        "Something went wrong"
      );

      expect(result.status).toBe("failed");
    });
  });

  describe("error handling", () => {
    it("should throw AgentQApiError on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { message: "Not found", code: "NOT_FOUND" },
          404
        )
      );

      const client = new AgentQClient(config);
      await expect(client.getAgent("missing")).rejects.toThrow(
        AgentQApiError
      );
    });

    it("should include status code in API errors", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { message: "Unauthorized" },
          401
        )
      );

      const client = new AgentQClient(config);
      try {
        await client.getAgent("any");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(AgentQApiError);
        expect((err as AgentQApiError).statusCode).toBe(401);
      }
    });
  });
});
