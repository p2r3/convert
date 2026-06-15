import { signal } from "@preact/signals";

export type LogLevel = "log" | "error" | "debug" | "warn";

export interface LogEntry {
  timestamp: number;
  plugin: string;
  message: string;
  level: LogLevel;
}

export interface ConvertContext {
  progress: (message: string, value: number | ((prev: number) => number)) => void;
  log: (message: string, level?: LogLevel) => void;
  signal: AbortSignal;
  throwIfAborted: () => void;
}

export const ProgressStore = {
  percent: signal(0),
  message: signal(""),
  logs: signal<LogEntry[]>([]),
  controller: new AbortController(),

  reset() {
    this.percent.value = 0;
    this.message.value = "";
    this.logs.value = [];
    this.controller = new AbortController();
  },

  abort() {
    this.controller.abort();
  },

  progress(message: string, percent: number) {
    this.message.value = message;
    this.percent.value = Math.max(0, Math.min(1, percent));
  },

  createContext(pluginName: string, userSignal?: AbortSignal): ConvertContext {
    const parentSignal = userSignal ?? this.controller.signal;
    return {
      progress: (msg, val) => {
        this.message.value = msg;
        const nextVal = typeof val === "function" ? val(this.percent.value) : val;
        this.percent.value = Math.max(0, Math.min(1, nextVal));
      },
      log: (msg, level = "log") => {
        this.logs.value = [
          ...this.logs.value,
          { timestamp: Date.now(), plugin: pluginName, message: msg, level }
        ];
      },
      signal: parentSignal,
      throwIfAborted() {
        if (parentSignal.aborted) throw new DOMException("Conversion cancelled", "AbortError");
      }
    };
  }
};
