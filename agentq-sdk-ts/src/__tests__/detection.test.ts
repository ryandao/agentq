import { describe, it, expect, beforeEach } from "vitest";
import { FrameworkDetector } from "../detection.js";
import { Framework } from "../types.js";

describe("FrameworkDetector", () => {
  let detector: FrameworkDetector;

  beforeEach(() => {
    detector = new FrameworkDetector();
  });

  it("should detect a framework as not installed when package is absent", () => {
    const result = detector.detect(Framework.LANGCHAIN);
    expect(result.framework).toBe("langchain");
    expect(result.installed).toBe(false);
    expect(result.active).toBe(false);
    expect(result.entryClasses).toEqual([]);
  });

  it("should detect all frameworks", () => {
    const results = detector.detectAll();
    expect(results).toHaveLength(4);
    expect(results.map((r) => r.framework)).toEqual([
      "langchain",
      "crewai",
      "autogen",
      "llamaindex",
    ]);
  });

  it("should cache detection results", () => {
    const first = detector.detect(Framework.CREWAI);
    const second = detector.detect(Framework.CREWAI);
    expect(first).toBe(second); // Same reference = cached
  });

  it("should clear cache on clearCache()", () => {
    const first = detector.detect(Framework.CREWAI);
    detector.clearCache();
    const second = detector.detect(Framework.CREWAI);
    expect(first).not.toBe(second); // Different reference
    expect(first).toEqual(second); // Same values
  });

  it("getInstalledFrameworks should return empty when nothing is installed", () => {
    const installed = detector.getInstalledFrameworks();
    expect(installed).toEqual([]);
  });

  it("getActiveFrameworks should return empty when nothing is active", () => {
    const active = detector.getActiveFrameworks();
    expect(active).toEqual([]);
  });
});
