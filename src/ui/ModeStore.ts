import { signal } from "@preact/signals";

const STORAGE_KEY = "mode";

export enum ModeEnum {
  Simple,
  Advanced,
}

export const enum ModeText {
  Simple = "Simple mode",
  Advanced = "Advanced mode",
}

function getInitialMode(): ModeEnum {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? parseInt(stored, 10) : ModeEnum.Simple;
}

export const Mode = signal<ModeEnum>(getInitialMode());

Mode.subscribe((value) => {
  localStorage.setItem(STORAGE_KEY, value.toString());
});

export function toggleMode() {
  Mode.value = Mode.value === ModeEnum.Advanced ? ModeEnum.Simple : ModeEnum.Advanced;
}
