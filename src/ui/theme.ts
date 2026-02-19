import { signal } from "@preact/signals";

const STORAGE_KEY = "theme";

export type Theme = "light" | "dark";

function getSystemTheme(): Theme {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

function getInitialTheme(): Theme {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return stored ?? getSystemTheme();
}

export const theme = signal<Theme>(getInitialTheme());

function applyTheme(value: Theme) {
    document.documentElement.dataset.theme = value;
}

theme.subscribe((value) => {
    localStorage.setItem(STORAGE_KEY, value);
    applyTheme(value);
});

export function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
}

export function initTheme() {
    applyTheme(theme.value);
}