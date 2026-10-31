import { signal } from "@preact/signals";

export type Theme = "light" | "dark";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = (e: MediaQueryListEvent) => {
    theme.value = e.matches ? "dark" : "light";
  };
  if (media.addEventListener) media.addEventListener("change", onChange);
  else media.addListener(onChange);
}
