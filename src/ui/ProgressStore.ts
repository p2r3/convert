import { signal } from "@preact/signals";
import type { ConvertOptions } from "../Settings.js";

const LOG_LEVELS = ["log", "error", "debug", "warn"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEntry {
  timestamp: number;
  plugin?: string;
  message: string;
  level: LogLevel;
}

export interface ConvertContext {
  progress: (message: string, value: number | ((prev: number) => number)) => void;
  log: (message: string, level?: LogLevel) => void;
  signal: AbortSignal;
  throwIfAborted: () => void;
  options: ConvertOptions;
}

export interface IProgressStore {
  progress: (message: string, percent: number) => void;
  log: (message: string, level?: LogLevel, pluginName?: string, relayToConsole?: boolean) => void;
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

  log(
    message: string,
    level: LogLevel = "log",
    pluginName?: string,
    relayToConsole: boolean = true,
  ) {
    this.logs.value = [
      ...this.logs.value,
      { timestamp: Date.now(), plugin: pluginName, message, level },
    ];
    if (relayToConsole) console[level](`[${pluginName}] ${message}`);
  },
};

export function createPortProgressStore(port: MessagePort): IProgressStore {
  return {
    progress: (message, percent) =>
      port.postMessage({ type: "progress", message: String(message), percent: Number(percent) }),
    log: (message, level = "log") =>
      port.postMessage({ type: "log", message: String(message), level }),
  };
}

export function relayPortProgress(port: MessagePort, pluginName: string) {
  port.addEventListener("message", ({ data }) => {
    if (typeof data !== "object" || data === null || typeof data.message !== "string") return;
    if (data.type === "progress" && typeof data.percent === "number")
      ProgressStore.progress(data.message, data.percent);
    else if (data.type === "log" && (LOG_LEVELS as readonly string[]).includes(data.level))
      ProgressStore.log(data.message, data.level, pluginName, false);
  });
  port.start();
}

export function createRemoteContext(
  store: IProgressStore,
  pluginName: string,
  abort: AbortSignal,
): ConvertContext {
  let prevVal = 0;

  return {
    progress: (msg, val) => {
      let nextVal = typeof val === "function" ? val(prevVal) : val;
      store.progress(msg, nextVal);
      prevVal = nextVal;
    },
    log: (msg, level = "log") => {
      store.log(msg, level, pluginName, false);
      console[level](`[${pluginName}] ${msg}`);
    },
    signal: abort,
    options: {},
    throwIfAborted() {
      if (abort.aborted) throw new DOMException("Conversion cancelled", "AbortError");
    },
  };
}
