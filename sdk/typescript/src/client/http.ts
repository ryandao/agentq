/**
 * Low-level HTTP client for communicating with the AgentQ API.
 * Uses native fetch (Node 18+) with no external dependencies.
 */

import type { AgentQConfig, ApiError } from "../types/index.js";
import {
  AgentQApiError,
  AgentQConfigError,
  AgentQNetworkError,
  AgentQTimeoutError,
} from "../errors.js";

/** HTTP methods supported by the client. */
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Options for an HTTP request. */
interface RequestOptions {
  method: HttpMethod;
  path: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

/**
 * Low-level HTTP client for the AgentQ API.
 * Handles authentication, serialization, error mapping, and timeouts.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: AgentQConfig) {
    if (!config.baseUrl) {
      throw new AgentQConfigError("baseUrl is required");
    }
    if (!config.apiKey) {
      throw new AgentQConfigError("apiKey is required");
    }

    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30_000;
    this.defaultHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...config.headers,
    };
  }

  /** Perform a GET request. */
  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>({ method: "GET", path, params });
  }

  /** Perform a POST request. */
  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "POST", path, body });
  }

  /** Perform a PUT request. */
  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "PUT", path, body });
  }

  /** Perform a PATCH request. */
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "PATCH", path, body });
  }

  /** Perform a DELETE request. */
  async delete<T>(path: string): Promise<T> {
    return this.request<T>({ method: "DELETE", path });
  }

  /** Build the full URL with query parameters. */
  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  /** Execute an HTTP request with timeout and error handling. */
  private async request<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.params);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          ...this.defaultHeaders,
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const apiError: ApiError = {
          statusCode: response.status,
          message:
            (errorBody as Record<string, string>).message ||
            response.statusText,
          code: (errorBody as Record<string, string>).code,
          details: errorBody as Record<string, unknown>,
        };
        throw new AgentQApiError(apiError);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof AgentQApiError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AgentQTimeoutError(this.timeout);
      }

      throw new AgentQNetworkError(
        `Network error: ${(error as Error).message}`,
        error as Error
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
