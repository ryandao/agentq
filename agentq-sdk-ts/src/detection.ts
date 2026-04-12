/**
 * Framework auto-detection module.
 *
 * Inspects the Node.js runtime to detect which agent frameworks are
 * installed and available, enabling zero-configuration integration.
 *
 * Detection works at two levels:
 * 1. **Installation check**: Can we resolve the framework's npm package?
 * 2. **Activity check**: Has the package been required/imported by user code?
 */

import {
  Framework,
  FRAMEWORKS,
  type DetectionResult,
  type FrameworkSpec,
} from "./types.js";
import { isPackageInstalled, getPackageVersion } from "./utils.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Framework specifications for Node.js detection
// ---------------------------------------------------------------------------

const FRAMEWORK_SPECS: Record<Framework, FrameworkSpec> = {
  [Framework.LANGCHAIN]: {
    packageName: "langchain",
    agentPackages: ["langchain", "@langchain/core"],
    agentExports: ["AgentExecutor", "RunnableSequence"],
  },
  [Framework.CREWAI]: {
    packageName: "crewai",
    agentPackages: ["crewai"],
    agentExports: ["Agent", "Crew", "Task"],
  },
  [Framework.AUTOGEN]: {
    packageName: "autogen",
    agentPackages: ["autogen"],
    agentExports: ["ConversableAgent", "AssistantAgent", "UserProxyAgent", "GroupChat"],
  },
  [Framework.LLAMAINDEX]: {
    packageName: "llamaindex",
    agentPackages: ["llamaindex"],
    agentExports: ["ReActAgent", "AgentRunner"],
  },
};

// ---------------------------------------------------------------------------
// FrameworkDetector
// ---------------------------------------------------------------------------

/**
 * Detects installed and active agent frameworks in the Node.js runtime.
 *
 * @example
 * ```ts
 * const detector = new FrameworkDetector();
 * const results = detector.detectAll();
 * for (const result of results) {
 *   if (result.installed) {
 *     console.log(`${result.framework} v${result.version} is installed`);
 *   }
 * }
 * ```
 */
export class FrameworkDetector {
  private cache = new Map<Framework, DetectionResult>();

  /**
   * Detect a single framework's presence and activity.
   */
  detect(framework: Framework): DetectionResult {
    const cached = this.cache.get(framework);
    if (cached) return cached;

    const spec = FRAMEWORK_SPECS[framework];
    const result = this.performDetection(framework, spec);
    this.cache.set(framework, result);

    logger.debug(
      `Detection result for ${framework}: installed=${result.installed}, active=${result.active}, version=${result.version ?? "unknown"}`,
    );

    return result;
  }

  /**
   * Detect all supported frameworks.
   */
  detectAll(): DetectionResult[] {
    return FRAMEWORKS.map((fw) => this.detect(fw));
  }

  /**
   * Return only frameworks that are installed and actively loaded.
   */
  getActiveFrameworks(): Framework[] {
    return this.detectAll()
      .filter((r) => r.installed && r.active)
      .map((r) => r.framework);
  }

  /**
   * Return all installed frameworks (whether actively loaded or not).
   */
  getInstalledFrameworks(): Framework[] {
    return this.detectAll()
      .filter((r) => r.installed)
      .map((r) => r.framework);
  }

  /**
   * Clear the detection cache to force re-detection.
   */
  clearCache(): void {
    this.cache.clear();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private performDetection(framework: Framework, spec: FrameworkSpec): DetectionResult {
    // Level 1: Is the package installed?
    const installed = isPackageInstalled(spec.packageName);
    if (!installed) {
      return {
        framework,
        installed: false,
        active: false,
        entryClasses: [],
      };
    }

    const version = getPackageVersion(spec.packageName);

    // Level 2: Is it loaded in the current process?
    const active = this.isFrameworkActive(spec);
    const entryClasses = active ? spec.agentExports : [];

    return {
      framework,
      installed: true,
      version,
      active,
      entryClasses,
    };
  }

  /**
   * Check if any of the framework's packages are loaded in the current
   * Node.js module cache (require.cache).
   */
  private isFrameworkActive(spec: FrameworkSpec): boolean {
    // Check if any of the framework's packages appear in require.cache
    if (typeof require !== "undefined" && require.cache) {
      const cacheKeys = Object.keys(require.cache);
      for (const pkg of spec.agentPackages) {
        const needle = `/node_modules/${pkg}/`;
        if (cacheKeys.some((key) => key.includes(needle))) {
          return true;
        }
      }
    }
    return false;
  }
}
