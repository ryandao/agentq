/**
 * Custom error classes for the AgentQ SDK.
 */

import type { ApiError } from "./types/index.js";

/** Base error class for all AgentQ SDK errors. */
export class AgentQError extends Error {
  public readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "AgentQError";
    this.code = code;
  }
}

/** Error thrown when the API returns an error response. */
export class AgentQApiError extends AgentQError {
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(apiError: ApiError) {
    super(apiError.message, apiError.code);
    this.name = "AgentQApiError";
    this.statusCode = apiError.statusCode;
    this.details = apiError.details;
  }
}

/** Error thrown when the SDK is not properly configured. */
export class AgentQConfigError extends AgentQError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "AgentQConfigError";
  }
}

/** Error thrown when a network error occurs. */
export class AgentQNetworkError extends AgentQError {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, "NETWORK_ERROR");
    this.name = "AgentQNetworkError";
    this.cause = cause;
  }
}

/** Error thrown when a request times out. */
export class AgentQTimeoutError extends AgentQError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`, "TIMEOUT");
    this.name = "AgentQTimeoutError";
  }
}

/** Error thrown when an agent is not found. */
export class AgentNotFoundError extends AgentQApiError {
  constructor(agentId: string) {
    super({
      statusCode: 404,
      message: `Agent not found: ${agentId}`,
      code: "AGENT_NOT_FOUND",
    });
    this.name = "AgentNotFoundError";
  }
}
