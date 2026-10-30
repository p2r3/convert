import { PopupData } from "src/ui";
import { openPopup } from "src/ui/PopupStore";
import { Mode, ModeEnum, toggleMode } from "src/ui/ModeStore";
import { Settings } from "lucide-preact";
import tippy from "tippy.js";
import "tippy.js/dist/tippy.css";
import { useEffect, useRef } from "preact/hooks";
import StyledButton, { ButtonVariant } from "src/ui/components/StyledButton";

import "./index.css";

function SettingsMenu() {
  const isAdvanced = Mode.value === ModeEnum.Advanced;

  return (
    <div className="settings-content">
      <h1>App settings</h1>

      <section className="settings-section">
        <h2>General</h2>

        <label className="settings-row">
          <div className="settings-row-text">
            <span className="settings-row-title">Advanced mode</span>
            <span className="settings-row-description">
              Choose which handler to use for each format.
            </span>
          </div>
          <input
            type="checkbox"
            role="switch"
            className="settings-switch"
            checked={isAdvanced}
            onChange={toggleMode}
          />
        </label>
      </section>
    </div>
  );
}

export default function SettingsButton() {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!btnRef.current) return;
    const instance = tippy(btnRef.current, {
      content: "App settings",
      placement: "bottom",
      delay: [300, 0],
    });
    return () => instance.destroy();
  }, []);

  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const onSettingsClick = () => {
    PopupData.value = {
      dismissible: true,
      buttonText: "Done",
      className: "settings-popup",
      contents: <SettingsMenu />,
    };
    openPopup();
  };

  return (
    <StyledButton
      buttonRef={btnRef}
      variant={ButtonVariant.Icon}
      ariaLabel="App settings"
      onClick={onSettingsClick}
    >
      <Settings size={18} />
    </StyledButton>
  );
}
