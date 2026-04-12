/**
 * Internal utility functions.
 */

import { randomUUID } from "node:crypto";

/** Generate a unique run ID. */
export function generateRunId(): string {
  return randomUUID();
}

/** Generate a short agent ID from a name or class. */
export function deriveAgentId(agent: unknown, providedId?: string): string {
  if (providedId) return providedId;

  if (agent && typeof agent === "object") {
    for (const attr of ["name", "agentName", "id", "agentId"] as const) {
      const val = (agent as Record<string, unknown>)[attr];
      if (typeof val === "string" && val.length > 0) {
        return val;
      }
    }
    const ctorName = (agent as { constructor?: { name?: string } }).constructor?.name;
    if (ctorName && ctorName !== "Object") {
      return `${ctorName}-${randomUUID().slice(0, 8)}`;
    }
  }

  return `agent-${randomUUID().slice(0, 8)}`;
}

/**
 * Attempt to resolve a Node.js package.
 * Returns the resolved module or null if not installed.
 */
export function tryRequire(packageName: string): unknown | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(packageName);
  } catch {
    return null;
  }
}

/**
 * Check if a package is importable (installed) without loading it.
 */
export function isPackageInstalled(packageName: string): boolean {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely get a version string from a package.
 */
export function getPackageVersion(packageName: string): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require(`${packageName}/package.json`) as { version?: string };
    return pkg.version;
  } catch {
    // Some packages don't allow direct package.json import.
    // Try importing the module and reading a version export.
    const mod = tryRequire(packageName);
    if (mod && typeof mod === "object" && "VERSION" in mod) {
      return String((mod as { VERSION: unknown }).VERSION);
    }
    return undefined;
  }
}
