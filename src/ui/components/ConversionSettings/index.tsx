import { signal } from "@preact/signals";
import type { ConversionSettings, SettingKey } from "src/ConversionSettings";

import "./index.css";

export const Settings = signal<ConversionSettings>({});
/** Encrypts the zip that bundles the outputs. Empty means no encryption. */
export const ZipPassword = signal("");

const FIELDS: Record<SettingKey, { label: string; max?: number; checkbox?: boolean }> = {
  quality: { label: "Image quality (1–100)", max: 100 },
  fps: { label: "Frame rate (fps)" },
  videoBitrate: { label: "Video bitrate (kbps)" },
  audioBitrate: { label: "Audio bitrate (kbps)" },
  maxSize: { label: "Longest side (pixels)" },
  start: { label: "Start at (seconds)" },
  end: { label: "End at (seconds)" },
  stripMetadata: { label: "Remove metadata (location, camera, tags)", checkbox: true },
};

interface ConversionSettingsFormProps {
  /** Settings that apply to the selected output formats. */
  keys: SettingKey[];
}

export default function ConversionSettingsForm({ keys }: ConversionSettingsFormProps) {
  return (
    <div className="conversion-settings">
      <h1>Output settings</h1>
      <p>Leave a field empty to use the default.</p>
      {keys.map((key) => (
        <label key={key}>
          <span>{FIELDS[key].label}</span>
          {FIELDS[key].checkbox ? (
            <input
              type="checkbox"
              checked={!!Settings.value[key]}
              onChange={(ev) => {
                Settings.value = { ...Settings.value, [key]: ev.currentTarget.checked };
              }}
            />
          ) : (
            <input
              type="number"
              min={key === "start" ? 0 : 1}
              step={key === "start" || key === "end" ? "any" : undefined}
              max={FIELDS[key].max}
              placeholder="Default"
              value={typeof Settings.value[key] === "number" ? Settings.value[key] : ""}
              onInput={(ev) => {
                const value = ev.currentTarget.valueAsNumber;
                Settings.value = {
                  ...Settings.value,
                  [key]: Number.isNaN(value) ? undefined : value,
                };
              }}
            />
          )}
        </label>
      ))}
      <label>
        <span>Zip password</span>
        <input
          type="password"
          autocomplete="new-password"
          placeholder="None"
          value={ZipPassword.value}
          onInput={(ev) => {
            ZipPassword.value = ev.currentTarget.value;
          }}
        />
      </label>
      <p>
        A password puts the result in an AES-256 encrypted zip. Windows Explorer and macOS Archive
        Utility can't open those; 7-Zip and Keka can.
      </p>
    </div>
  );
}
