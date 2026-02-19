import { h } from "preact";
import { theme, toggleTheme } from "../theme";
import { useEffect, useState } from "preact/hooks";

import sunIcon from "../img/fa-sun-solid-full.svg";
import moonIcon from "../img/fa-moon-solid-full.svg";

import "./DarkModeToggle.css";

export default function DarkModeToggle() {
    const [current, setCurrent] = useState(theme.value);

    useEffect(() => {
        const unsubscribe = theme.subscribe((value) => setCurrent(value));
        return () => unsubscribe();
    }, []);

    return (
        <button
            className="dark-mode-toggle"
            onClick={toggleTheme}
            title={current === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
            <img
                src={current === "dark" ? sunIcon : moonIcon}
                alt={current === "dark" ? "Sun" : "Moon"}
                className="dark-mode-toggle-icon"
            />
        </button>
    );
}
