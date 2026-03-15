const stored = localStorage.getItem("theme");
const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const theme = stored || (systemDark ? "dark" : "light");

document.documentElement.dataset.theme = theme;
