import { useEffect, useRef } from "preact/hooks";
import { SlidersHorizontal } from "lucide-preact";
import tippy from "tippy.js";
import "tippy.js/dist/tippy.css";

import Logo from "src/ui/components/Logo";
import SettingsButton from "src/ui/components/SettingsButton";
import StyledButton, { ButtonVariant } from "src/ui/components/StyledButton";
import { SETTINGS_BUTTON_ID, SETTINGS_PANEL_ID } from "src/ui/components/Conversion/SettingsPanel";
import { SettingsPanelOpen } from "src/ui/ConversionSettingsStore";
import { goToUploadHome } from "src/main";

import "./index.css";

interface ConversionHeaderProps {
  stepLabel?: string;
  logoDisabled?: boolean;
  settingsCount?: number;
  settingsDisabled?: boolean;
}

function ConversionSettingsButton({ count, disabled }: { count: number; disabled: boolean }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const open = SettingsPanelOpen.value && !disabled;

  useEffect(() => {
    if (!btnRef.current) return;
    const instance = tippy(btnRef.current, {
      content: "Conversion settings",
      placement: "bottom",
      delay: [300, 0],
    });
    return () => instance.destroy();
  }, []);

  const label = count ? `Conversion settings (${count} set)` : "Conversion settings";

  return (
    <StyledButton
      id={SETTINGS_BUTTON_ID}
      buttonRef={btnRef}
      className={`conversion-settings-toggle${open ? " active" : ""}`}
      variant={ButtonVariant.Icon}
      ariaLabel={label}
      ariaExpanded={open}
      ariaControls={SETTINGS_PANEL_ID}
      disabled={disabled}
      onClick={() => (SettingsPanelOpen.value = !SettingsPanelOpen.value)}
    >
      <SlidersHorizontal size={18} aria-hidden="true" />
      {count > 0 && (
        <span className="conversion-settings-badge" aria-hidden="true">
          {count}
        </span>
      )}
    </StyledButton>
  );
}

export default function ConversionHeader({
  stepLabel,
  logoDisabled = false,
  settingsCount = 0,
  settingsDisabled = false,
}: ConversionHeaderProps) {
  return (
    <header className="conversion-header">
      <div className="header-left">
        <Logo showName={true} size={24} onClick={goToUploadHome} disabled={logoDisabled} />
        {stepLabel && <span className="header-step-label">{stepLabel}</span>}
      </div>

      <div className="header-right">
        <SettingsButton />
        <ConversionSettingsButton count={settingsCount} disabled={settingsDisabled} />
      </div>
    </header>
  );
}
