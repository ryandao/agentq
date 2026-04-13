import { AsyncLocalStorage } from "node:async_hooks";
import type { SessionContext } from "./types.js";

/**
 * AsyncLocalStorage-based context propagation.
 *
 * Stores the current session context so it propagates automatically
 * through async boundaries (promises, setTimeout, etc.).
 */

const sessionStorage = new AsyncLocalStorage<SessionContext>();

/**
 * Get the current session context, if any.
 */
export function getSessionContext(): SessionContext | undefined {
  return sessionStorage.getStore();
}

/**
 * Run a function within a session context.
 * The context will be available to all async code called within `fn`.
 */
export function runWithSessionContext<T>(
  ctx: SessionContext,
  fn: () => T,
): T {
  // Merge with parent context if one exists
  const parent = getSessionContext();
  const merged: SessionContext = {
    ...parent,
    ...ctx,
    metadata: {
      ...parent?.metadata,
      ...ctx.metadata,
    },
  };
  return sessionStorage.run(merged, fn);
}
