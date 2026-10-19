import { signal } from "@preact/signals";
import type { ConversionSettings, SettingKey } from "src/ConversionSettings";

import "./index.css";

export const Settings = signal<ConversionSettings>({});
/** Encrypts the zip that bundles the outputs. Empty means no encryption. */
export const ZipPassword = signal("");

const FIELDS: Record<
  SettingKey,
  {
    label: string;
    min?: number;
    max?: number;
    step?: number | "any";
    checkbox?: boolean;
    text?: string;
    secret?: boolean;
  }
> = {
  quality: { label: "Image quality (1–100)", max: 100 },
  fps: { label: "Frame rate (fps)" },
  videoBitrate: { label: "Video bitrate (kbps)" },
  audioBitrate: { label: "Audio bitrate (kbps)" },
  maxSize: { label: "Longest side (pixels)" },
  start: { label: "Start at (seconds)" },
  end: { label: "End at (seconds)" },
  stripMetadata: { label: "Remove metadata (location, camera, tags)", checkbox: true },
  copyStreams: {
    label: "Cut without re-encoding (same format only, starts at the keyframe before)",
    checkbox: true,
  },
  pages: { label: "Pages to keep", text: "All, or 2-5,8" },
  rotate: { label: "Rotate pages (90, 180 or 270)", max: 270, step: 90 },
  password: { label: "Password to open the PDF", text: "None", secret: true },
  protect: { label: "Protect with password (no commas or =)", text: "None", secret: true },
  pageNumbers: { label: "Number the pages", checkbox: true },
  watermark: { label: "Watermark text", text: "None" },
  colors: { label: "Colours (2–256, fewer is smaller)", min: 2, max: 256 },
  normalize: { label: "Even out loudness (−14 LUFS)", checkbox: true },
  fadeIn: { label: "Fade in (seconds)", step: "any" },
  fadeOut: { label: "Fade out (seconds)", step: "any" },
  mono: { label: "Mix down to mono", checkbox: true },
  reverse: { label: "Play backwards", checkbox: true },
  trimSilence: { label: "Cut silence at the start and end", checkbox: true },
  speed: { label: "Speed (0.5–4, keeps the pitch)", min: 0.5, max: 4, step: "any" },
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
          ) : FIELDS[key].text ? (
            <input
              // Preact's types reject a type that is only known at runtime
              type={(FIELDS[key].secret ? "password" : "text") as "text"}
              autocomplete={FIELDS[key].secret ? "off" : undefined}
              placeholder={FIELDS[key].text}
              value={typeof Settings.value[key] === "string" ? Settings.value[key] : ""}
              onInput={(ev) => {
                Settings.value = { ...Settings.value, [key]: ev.currentTarget.value };
              }}
            />
          ) : (
            <input
              type="number"
              min={
                FIELDS[key].min ??
                (typeof FIELDS[key].step === "number" ? FIELDS[key].step : key === "start" ? 0 : 1)
              }
              step={key === "start" || key === "end" ? "any" : FIELDS[key].step}
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
