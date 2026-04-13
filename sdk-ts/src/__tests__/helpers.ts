import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { initTracer, shutdown } from "../tracer.js";

/**
 * Initialize tracer with an in-memory exporter for testing.
 * Returns the exporter so tests can inspect exported spans.
 */
export function initTestTracer(serviceName = "test"): InMemorySpanExporter {
  const exporter = new InMemorySpanExporter();
  initTracer({
    serviceName,
    debug: false,
    _exporter: exporter,
  });
  return exporter;
}

export { shutdown };
