import { describe, it, expect } from "vitest";
import { getSessionContext, runWithSessionContext } from "../context.js";

describe("context (AsyncLocalStorage)", () => {
  it("should return undefined when no session is active", () => {
    expect(getSessionContext()).toBeUndefined();
  });

  it("should provide session context within runWithSessionContext", () => {
    runWithSessionContext(
      { sessionId: "sess_1", userId: "user_1" },
      () => {
        const ctx = getSessionContext();
        expect(ctx).toBeDefined();
        expect(ctx?.sessionId).toBe("sess_1");
        expect(ctx?.userId).toBe("user_1");
      },
    );
  });

  it("should propagate context through async boundaries", async () => {
    await runWithSessionContext(
      { sessionId: "sess_async", runId: "run_1" },
      async () => {
        // Simulate async hop
        await new Promise((resolve) => setTimeout(resolve, 10));
        const ctx = getSessionContext();
        expect(ctx?.sessionId).toBe("sess_async");
        expect(ctx?.runId).toBe("run_1");
      },
    );
  });

  it("should merge with parent context", () => {
    runWithSessionContext(
      { sessionId: "parent", metadata: { env: "prod" } },
      () => {
        runWithSessionContext(
          { runId: "child_run", metadata: { version: "2" } },
          () => {
            const ctx = getSessionContext();
            expect(ctx?.sessionId).toBe("parent"); // inherited
            expect(ctx?.runId).toBe("child_run");   // from child
            expect(ctx?.metadata?.env).toBe("prod"); // inherited
            expect(ctx?.metadata?.version).toBe("2"); // from child
          },
        );
      },
    );
  });

  it("should not leak context outside runWithSessionContext", () => {
    runWithSessionContext({ sessionId: "contained" }, () => {
      expect(getSessionContext()?.sessionId).toBe("contained");
    });
    expect(getSessionContext()).toBeUndefined();
  });
});
