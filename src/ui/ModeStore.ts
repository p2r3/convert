import { signal } from "@preact/signals";

const STORAGE_KEY = "mode";

export enum ModeEnum {
	Simple,
	Advanced
}

export const enum ModeText {
	Simple = "Simple mode",
	Advanced = "Advanced mode"
}

function getInitialMode(): ModeEnum {
	const stored = localStorage.getItem(STORAGE_KEY);
	return (!!stored) ? parseInt(stored, 10) : ModeEnum.Simple;
}

export const Mode = signal<ModeEnum>(getInitialMode());

function applyMode(value: ModeEnum) {
	if (value === ModeEnum.Simple) document.documentElement.style.setProperty("--primary", "#1C77FF");
	if (value === ModeEnum.Advanced) document.documentElement.style.setProperty("--primary", "#FF6F1C");
}

Mode.subscribe((value) => {
	localStorage.setItem(STORAGE_KEY, value.toString());
	applyMode(value);
})

export function toggleMode() {
	Mode.value = Mode.value === ModeEnum.Advanced
		? ModeEnum.Simple
		: ModeEnum.Advanced;
}

export function initMode() {
	applyMode(Mode.value);
}
