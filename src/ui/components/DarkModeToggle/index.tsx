import { theme, toggleTheme } from "src/ui/ThemeStore"
import { useEffect, useState } from "preact/hooks"
import StyledButton, { ButtonVariant } from "src/ui/components/StyledButton"

import sunIcon from "src/ui/img/fa-sun-solid-full.svg"
import moonIcon from "src/ui/img/fa-moon-solid-full.svg"

export default function DarkModeToggle() {
    const [current, setCurrent] = useState(theme.value)

    useEffect(() => {
        const unsubscribe = theme.subscribe((value) => setCurrent(value))
        return () => unsubscribe()
    }, [])

    return (
        <StyledButton
            variant={ ButtonVariant.Icon }
            onClick={ toggleTheme }
            title={ current === "dark" ? "Switch to light mode" : "Switch to dark mode" }
        >
            <img
                src={ current === "dark" ? sunIcon : moonIcon }
                alt={ current === "dark" ? "Sun" : "Moon" }
            />
        </StyledButton>
    )
}
