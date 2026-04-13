import { describe, it, expect, afterEach } from "vitest";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { initTracer, getTracer, isInitialized, shutdown, getActiveSpan } from "../tracer.js";

describe("tracer", () => {
  afterEach(async () => {
    await shutdown();
  });

  it("should not be initialized initially", () => {
    expect(isInitialized()).toBe(false);
  });

  it("should initialize and return a tracer", () => {
    const tracer = initTracer({
      serviceName: "test-service",
      _exporter: new InMemorySpanExporter(),
    });
    expect(tracer).toBeDefined();
    expect(isInitialized()).toBe(true);
  });

  it("should return the same tracer on repeated init calls", () => {
    const exporter = new InMemorySpanExporter();
    const tracer1 = initTracer({ serviceName: "test-service", _exporter: exporter });
    const tracer2 = initTracer({ serviceName: "test-service", _exporter: exporter });
    expect(tracer1).toBe(tracer2);
  });

  it("getTracer should throw before init", () => {
    expect(() => getTracer()).toThrow("AgentQ SDK not initialized");
  });

  it("getTracer should return tracer after init", () => {
    initTracer({ _exporter: new InMemorySpanExporter() });
    expect(() => getTracer()).not.toThrow();
    expect(getTracer()).toBeDefined();
  });

  it("should return undefined for getActiveSpan when no span is active", () => {
    initTracer({ _exporter: new InMemorySpanExporter() });
    expect(getActiveSpan()).toBeUndefined();
  });

  it("shutdown should reset initialization state", async () => {
    initTracer({ _exporter: new InMemorySpanExporter() });
    expect(isInitialized()).toBe(true);
    await shutdown();
    expect(isInitialized()).toBe(false);
  });
});
