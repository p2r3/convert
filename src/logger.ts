/**
 * Centralized logging utility that respects environment settings.
 * In production, only warnings and errors are logged.
 * In development, all logs are shown.
 */

// Check if we're in development mode
const isDevelopment = typeof window !== "undefined" && 
  (window.location?.hostname === "localhost" || 
   window.location?.hostname === "127.0.0.1" ||
   window.location?.hostname === "0.0.0.0");

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/**
 * Current log level - higher means less verbose
 */
const currentLogLevel = isDevelopment ? LogLevel.DEBUG : LogLevel.WARN;

/**
 * Centralized logger for the application
 */
export const logger = {
  /**
   * Log debug messages (development only)
   */
  debug: (...args: unknown[]) => {
    if (currentLogLevel <= LogLevel.DEBUG) {
      console.debug("[DEBUG]", ...args);
    }
  },

  /**
   * Log info messages (development only)
   */
  info: (...args: unknown[]) => {
    if (currentLogLevel <= LogLevel.INFO) {
      console.info("[INFO]", ...args);
    }
  },

  /**
   * Log warnings (shown in all environments)
   */
  warn: (...args: unknown[]) => {
    if (currentLogLevel <= LogLevel.WARN) {
      console.warn("[WARN]", ...args);
    }
  },

  /**
   * Log errors (shown in all environments)
   */
  error: (...args: unknown[]) => {
    if (currentLogLevel <= LogLevel.ERROR) {
      console.error("[ERROR]", ...args);
    }
  },

  /**
   * Log group for related messages
   */
  group: (label: string) => {
    if (currentLogLevel <= LogLevel.INFO) {
      console.group(label);
    }
  },

  /**
   * End log group
   */
  groupEnd: () => {
    if (currentLogLevel <= LogLevel.INFO) {
      console.groupEnd();
    }
  },

  /**
   * Check if development mode is active
   */
  isDevelopment: () => isDevelopment
};

/**
 * Replace console methods with logger in production code
 * This is used to ensure no console calls slip into production
 */
export function replaceConsole(): void {
  // Only replace in production builds
  if (isDevelopment) return;

  // In production, redirect console.debug and console.info to no-op
  // or keep them as warnings only
  const noop = () => {};
  (console as unknown as Record<string, () => void>).debug = noop;
  (console as unknown as Record<string, () => void>).info = noop;
}
