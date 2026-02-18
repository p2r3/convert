/**
 * Registry for tracking handler initialization status and errors.
 * Provides observable access to handler initialization failures.
 */

import type { FormatHandler } from "./FormatHandler.ts";

export interface HandlerInitError {
  handlerName: string;
  error: Error | unknown;
  timestamp: Date;
}

class HandlerRegistry {
  private initErrors: Map<string, HandlerInitError> = new Map();
  private initializedHandlers: Set<string> = new Set();

  /**
   * Register a handler and track its initialization status.
   * @param handler The handler to register
   * @returns true if initialization succeeded, false otherwise
   */
  register(handler: FormatHandler): boolean {
    try {
      // Attempt to initialize the handler
      const initPromise = handler.init();
      
      // Handle sync and async initialization
      if (initPromise && typeof initPromise.then === 'function') {
        // Async initialization - we'll handle this differently
        initPromise.then(() => {
          this.initializedHandlers.add(handler.name);
        }).catch((error: unknown) => {
          this.initErrors.set(handler.name, {
            handlerName: handler.name,
            error,
            timestamp: new Date()
          });
          console.error(`Handler "${handler.name}" initialization failed:`, error);
        });
      } else {
        // Sync initialization succeeded
        this.initializedHandlers.add(handler.name);
      }
      return true;
    } catch (error) {
      // Initialization failed synchronously
      this.initErrors.set(handler.name, {
        handlerName: handler.name,
        error,
        timestamp: new Date()
      });
      console.error(`Handler "${handler.name}" initialization failed:`, error);
      return false;
    }
  }

  /**
   * Get all handler initialization errors.
   * @returns Array of handler initialization errors
   */
  getInitErrors(): HandlerInitError[] {
    return Array.from(this.initErrors.values());
  }

  /**
   * Check if a specific handler had an initialization error.
   * @param handlerName Name of the handler to check
   * @returns true if the handler had an initialization error
   */
  hasError(handlerName: string): boolean {
    return this.initErrors.has(handlerName);
  }

  /**
   * Get a specific handler's initialization error.
   * @param handlerName Name of the handler
   * @returns The error if any, undefined otherwise
   */
  getError(handlerName: string): HandlerInitError | undefined {
    return this.initErrors.get(handlerName);
  }

  /**
   * Check if a handler was successfully initialized.
   * @param handlerName Name of the handler to check
   * @returns true if the handler was initialized successfully
   */
  isInitialized(handlerName: string): boolean {
    return this.initializedHandlers.has(handlerName);
  }

  /**
   * Clear all initialization errors (useful for testing).
   */
  clear(): void {
    this.initErrors.clear();
    this.initializedHandlers.clear();
  }
}

// Singleton instance for global access
export const handlerRegistry = new HandlerRegistry();
