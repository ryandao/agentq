/**
 * AgentQ client — the main entry point for interacting with the AgentQ platform.
 */

import { HttpClient } from "./http.js";
import type {
  Agent,
  AgentQConfig,
  AgentTask,
  HeartbeatPayload,
  ListAgentsParams,
  PaginatedResponse,
  RegisterAgentRequest,
  UpdateAgentRequest,
} from "../types/index.js";

/**
 * Client for the AgentQ platform.
 *
 * @example
 * ```ts
 * import { AgentQClient } from "@agentq/sdk";
 *
 * const client = new AgentQClient({
 *   baseUrl: "https://api.agentq.dev",
 *   apiKey: "your-api-key",
 * });
 *
 * const agent = await client.registerAgent({
 *   name: "my-agent",
 *   description: "A helpful assistant",
 *   framework: "langchain",
 *   capabilities: ["chat", "search"],
 * });
 * ```
 */
export class AgentQClient {
  private readonly http: HttpClient;

  constructor(config: AgentQConfig) {
    this.http = new HttpClient(config);
  }

  // ── Agent CRUD ────────────────────────────────────────────────────────

  /**
   * Register a new agent with the AgentQ platform.
   * @param request - Agent registration details.
   * @returns The newly created agent.
   */
  async registerAgent(request: RegisterAgentRequest): Promise<Agent> {
    return this.http.post<Agent>("/api/v1/agents", request);
  }

  /**
   * Retrieve an agent by its ID.
   * @param agentId - The unique agent identifier.
   * @returns The agent record.
   */
  async getAgent(agentId: string): Promise<Agent> {
    return this.http.get<Agent>(`/api/v1/agents/${agentId}`);
  }

  /**
   * List agents with optional filters and pagination.
   * @param params - Query parameters for filtering and pagination.
   * @returns A paginated list of agents.
   */
  async listAgents(
    params?: ListAgentsParams
  ): Promise<PaginatedResponse<Agent>> {
    return this.http.get<PaginatedResponse<Agent>>("/api/v1/agents", {
      page: params?.page,
      pageSize: params?.pageSize,
      status: params?.status,
      framework: params?.framework,
      search: params?.search,
    });
  }

  /**
   * Update an existing agent.
   * @param agentId - The agent to update.
   * @param request - Fields to update.
   * @returns The updated agent.
   */
  async updateAgent(
    agentId: string,
    request: UpdateAgentRequest
  ): Promise<Agent> {
    return this.http.patch<Agent>(`/api/v1/agents/${agentId}`, request);
  }

  /**
   * Delete (deregister) an agent.
   * @param agentId - The agent to delete.
   */
  async deleteAgent(agentId: string): Promise<void> {
    return this.http.delete<void>(`/api/v1/agents/${agentId}`);
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────

  /**
   * Send a heartbeat to indicate the agent is still alive.
   * @param payload - Heartbeat data.
   */
  async heartbeat(payload: HeartbeatPayload): Promise<void> {
    return this.http.post<void>(
      `/api/v1/agents/${payload.agentId}/heartbeat`,
      payload
    );
  }

  // ── Tasks ─────────────────────────────────────────────────────────────

  /**
   * Get the next pending task for an agent.
   * @param agentId - The agent to fetch tasks for.
   * @returns The next task, or null if none are available.
   */
  async getNextTask(agentId: string): Promise<AgentTask | null> {
    return this.http.get<AgentTask | null>(
      `/api/v1/agents/${agentId}/tasks/next`
    );
  }

  /**
   * Submit the result of a completed task.
   * @param agentId - The agent that completed the task.
   * @param taskId - The task ID.
   * @param output - The task output.
   */
  async submitTaskResult(
    agentId: string,
    taskId: string,
    output: string
  ): Promise<AgentTask> {
    return this.http.post<AgentTask>(
      `/api/v1/agents/${agentId}/tasks/${taskId}/result`,
      { output }
    );
  }

  /**
   * Report a task failure.
   * @param agentId - The agent that failed the task.
   * @param taskId - The task ID.
   * @param error - Error message or details.
   */
  async reportTaskFailure(
    agentId: string,
    taskId: string,
    error: string
  ): Promise<AgentTask> {
    return this.http.post<AgentTask>(
      `/api/v1/agents/${agentId}/tasks/${taskId}/fail`,
      { error }
    );
  }
}
