/**
 * Minimal structured logger for the AgentQ SDK.
 *
 * Avoids external dependencies; uses console under the hood with
 * a debug flag to control verbosity.
 */

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

let _debug = false;

export function setDebug(enabled: boolean): void {
  _debug = enabled;
}

function formatMessage(level: string, message: string): string {
  return `[agentq:${level}] ${message}`;
}

export const logger: Logger = {
  debug(message: string, ...args: unknown[]): void {
    if (_debug) {
      console.debug(formatMessage("debug", message), ...args);
    }
  },
  info(message: string, ...args: unknown[]): void {
    console.info(formatMessage("info", message), ...args);
  },
  warn(message: string, ...args: unknown[]): void {
    console.warn(formatMessage("warn", message), ...args);
  },
  error(message: string, ...args: unknown[]): void {
    console.error(formatMessage("error", message), ...args);
  },
};
