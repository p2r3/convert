const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const theme = systemDark ? "dark" : "light";

document.documentElement.dataset.theme = theme;
