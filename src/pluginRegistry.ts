import type { FormatHandler } from "./FormatHandler.ts";
import handlers from "./handlers/index.ts";

declare global {
    interface Window {
        registerPlugin: (handler: FormatHandler) => void;
    }
}

/**
 * Registers a new format handler at runtime.
 * Useful for debugging or external scripts.
 * @param handler The handler instance to register.
 */
export function registerPlugin(handler: FormatHandler) {
    handlers.push(handler);
    // Clear the cache for this handler so it gets re-initialized if needed
    if (window.supportedFormatCache) {
        window.supportedFormatCache.delete(handler.name);
    }
    console.log(`Plugin "${handler.name}" registered successfully.`);
}

// Expose to window for console access
if (typeof window !== "undefined") {
    window.registerPlugin = registerPlugin;
}
