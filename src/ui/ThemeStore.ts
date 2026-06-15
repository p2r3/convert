import { signal } from "@preact/signals";

export type Theme = "light" | "dark";

function getSystemTheme(): Theme {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

export const theme = signal<Theme>(getSystemTheme());

function applyTheme(value: Theme) {
    document.documentElement.dataset.theme = value;
}

theme.subscribe((value) => {
    applyTheme(value);
});

export function initTheme() {
    applyTheme(theme.value);

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        theme.value = e.matches ? "dark" : "light";
    });
}