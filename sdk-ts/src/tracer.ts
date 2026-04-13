import { trace, context, type Span, type Tracer } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  InMemorySpanExporter,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { InitOptions } from "./types.js";

const LIBRARY_NAME = "agentq-sdk-ts";
const LIBRARY_VERSION = "0.1.0";

let _provider: NodeTracerProvider | null = null;
let _tracer: Tracer | null = null;
let _initialized = false;
let _exporter: SpanExporter | null = null;

/**
 * Initialize the AgentQ tracing pipeline.
 */
export function initTracer(options: InitOptions = {}): Tracer {
  if (_initialized && _tracer) {
    return _tracer;
  }

  const apiKey = options.apiKey ?? process.env["AGENTQ_API_KEY"] ?? "";
  const endpoint =
    options.endpoint ??
    process.env["AGENTQ_ENDPOINT"] ??
    "https://ingest.agentq.dev";
  const serviceName =
    options.serviceName ?? process.env["AGENTQ_SERVICE_NAME"] ?? "agentq-app";
  const debug = options.debug ?? process.env["AGENTQ_DEBUG"] === "true";

  // Build headers
  const headers: Record<string, string> = {
    ...options.headers,
  };
  if (apiKey) {
    headers["x-agentq-api-key"] = apiKey;
  }

  // Create exporter — use InMemorySpanExporter for testing
  if (options._exporter) {
    _exporter = options._exporter;
  } else {
    _exporter = new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
      headers,
    });
  }

  // Create resource
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    "agentq.sdk.language": "typescript",
    "agentq.sdk.version": LIBRARY_VERSION,
  });

  // Create provider
  _provider = new NodeTracerProvider({
    resource,
  });

  // Add span processor
  if (debug) {
    // In debug mode, use SimpleSpanProcessor for immediate export
    _provider.addSpanProcessor(new SimpleSpanProcessor(_exporter));
  } else {
    const batchConfig = options.batchConfig ?? {};
    _provider.addSpanProcessor(
      new BatchSpanProcessor(_exporter, {
        maxQueueSize: batchConfig.maxQueueSize ?? 2048,
        maxExportBatchSize: batchConfig.maxExportBatchSize ?? 512,
        scheduledDelayMillis: batchConfig.scheduledDelayMillis ?? 5000,
        exportTimeoutMillis: batchConfig.exportTimeoutMillis ?? 30000,
      }),
    );
  }

  // Register as global provider
  _provider.register();

  _tracer = trace.getTracer(LIBRARY_NAME, LIBRARY_VERSION);
  _initialized = true;

  if (debug) {
    console.log(
      `[agentq] Initialized tracing → ${endpoint} (service: ${serviceName})`,
    );
  }

  return _tracer;
}

/**
 * Create an InMemorySpanExporter for testing.
 * Use with `init({ _exporter: createTestExporter() })`.
 */
export function createTestExporter(): InMemorySpanExporter {
  return new InMemorySpanExporter();
}

/**
 * Get the current tracer instance.
 * Throws if `init()` has not been called.
 */
export function getTracer(): Tracer {
  if (!_tracer) {
    throw new Error(
      "AgentQ SDK not initialized. Call `init()` before using tracing features.",
    );
  }
  return _tracer;
}

/**
 * Get the current active span from the OpenTelemetry context.
 */
export function getActiveSpan(): Span | undefined {
  const span = trace.getSpan(context.active());
  return span;
}

/**
 * Gracefully shut down the tracing pipeline.
 * Flushes any pending spans before shutdown.
 */
export async function shutdown(): Promise<void> {
  if (_provider) {
    await _provider.shutdown();
    _provider = null;
    _tracer = null;
    _initialized = false;
  }
}

/**
 * Force-flush any pending spans.
 */
export async function flush(): Promise<void> {
  if (_provider) {
    await _provider.forceFlush();
  }
}

export function isInitialized(): boolean {
  return _initialized;
}
