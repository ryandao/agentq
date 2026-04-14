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

/** Callback invoked before each request. Return modified headers if needed. */
export type RequestHook = (
  method: HttpMethod,
  url: string,
  headers: Record<string, string>
) => Record<string, string> | void;

/** Callback invoked after each response (before parsing). */
export type ResponseHook = (
  method: HttpMethod,
  url: string,
  status: number,
  durationMs: number
) => void;

/** Default retryable HTTP status codes. */
const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

/** Resolved retry configuration with defaults applied. */
interface ResolvedRetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatuses: number[];
}

/**
 * Low-level HTTP client for the AgentQ API.
 * Handles authentication, serialization, error mapping, timeouts, and retries.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly retry: ResolvedRetryConfig | null;
  private readonly requestHooks: RequestHook[] = [];
  private readonly responseHooks: ResponseHook[] = [];

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

    // Resolve retry config
    if (config.retry) {
      this.retry = {
        maxRetries: config.retry.maxRetries ?? 3,
        baseDelay: config.retry.baseDelay ?? 1_000,
        maxDelay: config.retry.maxDelay ?? 30_000,
        retryableStatuses:
          config.retry.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES,
      };
    } else {
      this.retry = null;
    }
  }

  // ── Hook Registration ──────────────────────────────────────────────

  /** Register a hook invoked before each request. */
  onRequest(hook: RequestHook): void {
    this.requestHooks.push(hook);
  }

  /** Register a hook invoked after each response. */
  onResponse(hook: ResponseHook): void {
    this.responseHooks.push(hook);
  }

  // ── HTTP Methods ───────────────────────────────────────────────────

  /** Perform a GET request. */
  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.requestWithRetry<T>({ method: "GET", path, params });
  }

  /** Perform a POST request. */
  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.requestWithRetry<T>({ method: "POST", path, body });
  }

  /** Perform a PUT request. */
  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.requestWithRetry<T>({ method: "PUT", path, body });
  }

  /** Perform a PATCH request. */
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.requestWithRetry<T>({ method: "PATCH", path, body });
  }

  /** Perform a DELETE request. */
  async delete<T>(path: string): Promise<T> {
    return this.requestWithRetry<T>({ method: "DELETE", path });
  }

  // ── URL Building ───────────────────────────────────────────────────

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

  // ── Retry Logic ────────────────────────────────────────────────────

  /**
   * Compute the delay before the next retry using exponential backoff
   * with full jitter.
   */
  private computeRetryDelay(attempt: number, config: ResolvedRetryConfig): number {
    const exponential = config.baseDelay * Math.pow(2, attempt);
    const capped = Math.min(exponential, config.maxDelay);
    // Full jitter: random between 0 and capped
    return Math.random() * capped;
  }

  /** Check if an error is retryable based on the retry configuration. */
  private isRetryable(error: unknown): boolean {
    if (!this.retry) return false;
    if (error instanceof AgentQApiError) {
      return this.retry.retryableStatuses.includes(error.statusCode);
    }
    // Retry on network/timeout errors
    if (error instanceof AgentQNetworkError) return true;
    if (error instanceof AgentQTimeoutError) return true;
    return false;
  }

  /** Execute a request with automatic retry on transient failures. */
  private async requestWithRetry<T>(options: RequestOptions): Promise<T> {
    const maxAttempts = this.retry ? this.retry.maxRetries + 1 : 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.request<T>(options);
      } catch (error) {
        lastError = error;

        const isLast = attempt >= maxAttempts - 1;
        if (isLast || !this.isRetryable(error)) {
          throw error;
        }

        // Wait before retrying
        const delay = this.computeRetryDelay(attempt, this.retry!);
        await this.sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs this
    throw lastError;
  }

  /** Sleep for the specified duration (extracted for testability). */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Core Request ───────────────────────────────────────────────────

  /** Execute a single HTTP request with timeout and error handling. */
  private async request<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.params);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // Run request hooks
    let headers = { ...this.defaultHeaders, ...options.headers };
    for (const hook of this.requestHooks) {
      const modified = hook(options.method, url, headers);
      if (modified) {
        headers = modified;
      }
    }

    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const durationMs = Date.now() - startTime;

      // Run response hooks
      for (const hook of this.responseHooks) {
        hook(options.method, url, response.status, durationMs);
      }

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
