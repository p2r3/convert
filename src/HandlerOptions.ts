import type { FormatHandler, HandlerOptionDefinition, HandlerOptionValue } from "./FormatHandler.ts";

const STORAGE_KEY = "convert.handler-options.v1";

type StoredHandlerOptions = Record<string, Record<string, HandlerOptionValue>>;

const defaultsByHandler = new Map<string, Record<string, HandlerOptionValue>>();

function isValidOptionValue(value: unknown): value is HandlerOptionValue {
	if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
		return true;
	}
	if (!Array.isArray(value)) return false;
	return value.every(item => typeof item === "string");
}

function safeGetStorage(): Storage | undefined {
	try {
		if (typeof window === "undefined") return undefined;
		return window.localStorage;
	} catch {
		return undefined;
	}
}

function loadSnapshot(): StoredHandlerOptions {
	const storage = safeGetStorage();
	if (!storage) return {};
	const raw = storage.getItem(STORAGE_KEY);
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object") return {};
		const out: StoredHandlerOptions = {};
		for (const [handlerName, values] of Object.entries(parsed as Record<string, unknown>)) {
			if (!values || typeof values !== "object") continue;
			const perHandler: Record<string, HandlerOptionValue> = {};
			for (const [id, value] of Object.entries(values as Record<string, unknown>)) {
				if (isValidOptionValue(value)) perHandler[id] = value;
			}
			out[handlerName] = perHandler;
		}
		return out;
	} catch {
		return {};
	}
}

function saveSnapshot(snapshot: StoredHandlerOptions): void {
	const storage = safeGetStorage();
	if (!storage) return;
	storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function getCurrentValues(options: HandlerOptionDefinition[]): Record<string, HandlerOptionValue> {
	const out: Record<string, HandlerOptionValue> = {};
	for (const option of options) {
		out[option.id] = option.getValue();
	}
	return out;
}

function normalizeValue(option: HandlerOptionDefinition, value: unknown): HandlerOptionValue {
	switch (option.kind) {
		case "toggle": {
			if (typeof value === "boolean") return value;
			if (typeof value === "string") return value === "true";
			return !!value;
		}
		case "number": {
			const parsed = typeof value === "number" ? value : Number(value);
			const fallback = option.defaultValue ?? option.getValue();
			let next = Number.isFinite(parsed) ? parsed : fallback;
			if (typeof option.min === "number") next = Math.max(option.min, next);
			if (typeof option.max === "number") next = Math.min(option.max, next);
			return next;
		}
		case "text": {
			let next = typeof value === "string" ? value : String(value ?? "");
			if (typeof option.maxLength === "number") next = next.slice(0, option.maxLength);
			return next;
		}
		case "select": {
			const choices = new Set(option.choices.map(c => c.value));
			const fallback = option.defaultValue ?? option.getValue() ?? option.choices[0]?.value ?? "";
			if (typeof value !== "string") return fallback;
			return choices.has(value) ? value : fallback;
		}
		case "multiselect": {
			const choices = new Set(option.choices.map(c => c.value));
			const arr = Array.isArray(value) ? value.filter((c): c is string => typeof c === "string") : [];
			const filtered = arr.filter(v => choices.has(v));
			if (filtered.length > 0) return filtered;
			return option.defaultValue ?? option.getValue().filter(v => choices.has(v));
		}
	}
}

function setOptionValue(option: HandlerOptionDefinition, value: HandlerOptionValue): void {
	switch (option.kind) {
		case "toggle":
			option.setValue(Boolean(value));
			return;
		case "number":
			option.setValue(Number(value));
			return;
		case "text":
		case "select":
			option.setValue(String(value));
			return;
		case "multiselect":
			option.setValue(Array.isArray(value) ? value : []);
			return;
	}
}

function persistHandler(handler: FormatHandler): void {
	const options = handler.getOptions?.() ?? [];
	const snapshot = loadSnapshot();
	if (options.length === 0) {
		delete snapshot[handler.name];
		saveSnapshot(snapshot);
		return;
	}
	snapshot[handler.name] = getCurrentValues(options);
	saveSnapshot(snapshot);
}

export function initializeHandlerOptions(handlers: FormatHandler[]): void {
	const snapshot = loadSnapshot();
	for (const handler of handlers) {
		const options = handler.getOptions?.() ?? [];
		if (options.length === 0) continue;
		const defaults = getCurrentValues(options);
		defaultsByHandler.set(handler.name, defaults);
		const savedForHandler = snapshot[handler.name] ?? {};
		for (const option of options) {
			const next = normalizeValue(option, savedForHandler[option.id] ?? defaults[option.id]);
			setOptionValue(option, next);
		}
	}
}

export function applyOptionValue(
	handler: FormatHandler,
	option: HandlerOptionDefinition,
	rawValue: unknown
): HandlerOptionValue {
	const next = normalizeValue(option, rawValue);
	setOptionValue(option, next);
	persistHandler(handler);
	return next;
}

export function getOptionValues(handler: FormatHandler): Record<string, HandlerOptionValue> {
	const options = handler.getOptions?.() ?? [];
	return getCurrentValues(options);
}

export function shouldShowOption(
	option: HandlerOptionDefinition,
	values: Readonly<Record<string, HandlerOptionValue>>
): boolean {
	if (!option.showWhen) return true;
	try {
		return option.showWhen(values);
	} catch {
		return true;
	}
}

export function resetHandlerOptions(handler: FormatHandler): void {
	const options = handler.getOptions?.() ?? [];
	if (options.length === 0) return;
	const defaults = defaultsByHandler.get(handler.name);
	for (const option of options) {
		const baseline = defaults?.[option.id] ?? option.defaultValue ?? option.getValue();
		const next = normalizeValue(option, baseline);
		setOptionValue(option, next);
	}
	persistHandler(handler);
}

export function resetAllHandlerOptions(handlers: FormatHandler[]): void {
	for (const handler of handlers) {
		resetHandlerOptions(handler);
	}
}
