import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { session } from "../session.js";
import { getSessionContext } from "../context.js";
import { shutdown } from "../tracer.js";
import { initTestTracer } from "./helpers.js";

describe("session()", () => {
  beforeEach(() => {
    initTestTracer();
  });

  afterEach(async () => {
    await shutdown();
  });

  it("should provide session context within the callback", async () => {
    let capturedCtx: ReturnType<typeof getSessionContext>;
    await session(
      { sessionId: "sess_1", userId: "user_abc" },
      async () => {
        capturedCtx = getSessionContext();
      },
    );
    expect(capturedCtx!).toBeDefined();
    expect(capturedCtx!.sessionId).toBe("sess_1");
    expect(capturedCtx!.userId).toBe("user_abc");
  });

  it("should return the result of the callback", async () => {
    const result = await session({ sessionId: "s1" }, async () => {
      return 42;
    });
    expect(result).toBe(42);
  });

  it("should propagate errors", async () => {
    await expect(
      session({ sessionId: "fail" }, async () => {
        throw new Error("session error");
      }),
    ).rejects.toThrow("session error");
  });

  it("should include metadata in session context", async () => {
    let capturedMetadata: Record<string, string> | undefined;
    await session(
      { sessionId: "meta_sess", metadata: { env: "test", version: "1.0" } },
      async () => {
        capturedMetadata = getSessionContext()?.metadata;
      },
    );
    expect(capturedMetadata).toEqual({ env: "test", version: "1.0" });
  });
});
