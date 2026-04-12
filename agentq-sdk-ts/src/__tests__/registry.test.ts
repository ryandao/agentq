import { describe, it, expect, beforeEach } from "vitest";
import { AdapterRegistry } from "../registry.js";
import { BaseAdapter } from "../adapters/base.js";
import { Framework } from "../types.js";

describe("AdapterRegistry", () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  it("should have built-in adapters for all frameworks", () => {
    expect(registry.has(Framework.LANGCHAIN)).toBe(true);
    expect(registry.has(Framework.CREWAI)).toBe(true);
    expect(registry.has(Framework.AUTOGEN)).toBe(true);
    expect(registry.has(Framework.LLAMAINDEX)).toBe(true);
  });

  it("should lazily instantiate adapters", () => {
    const adapter = registry.get(Framework.LANGCHAIN);
    expect(adapter).toBeInstanceOf(BaseAdapter);
    expect(adapter.framework).toBe("langchain");
  });

  it("should return the same instance on repeated get()", () => {
    const a = registry.get(Framework.LANGCHAIN);
    const b = registry.get(Framework.LANGCHAIN);
    expect(a).toBe(b);
  });

  it("should allow registering a custom adapter factory", () => {
    class CustomAdapter extends BaseAdapter {
      readonly framework = Framework.LANGCHAIN;
      patch(): void {
        this.markPatched();
      }
      unpatch(): void {
        this.markUnpatched();
      }
      wrapAgent<T>(agent: T): T {
        return agent;
      }
    }

    registry.register(Framework.LANGCHAIN, CustomAdapter);
    const adapter = registry.get(Framework.LANGCHAIN);
    expect(adapter).toBeInstanceOf(CustomAdapter);
  });

  it("should unpatch all active adapters", () => {
    const adapter = registry.get(Framework.LANGCHAIN);
    // Manually patch (LangChain isn't installed, but we can still test the mechanics)
    (adapter as any)._patched = true;
    expect(adapter.isPatched).toBe(true);

    registry.unpatchAll();
    expect(adapter.isPatched).toBe(false);
  });

  it("should clear all instances", () => {
    registry.get(Framework.LANGCHAIN);
    expect(registry.getActive()).toHaveLength(1);

    registry.clear();
    expect(registry.getActive()).toHaveLength(0);
  });
});
