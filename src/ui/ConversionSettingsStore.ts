import { signal } from "@preact/signals";

import type { FileFormat } from "src/FormatHandler";
import { Settings, isValidOption, type ConvertOptions, type OptionSpec } from "src/Settings";

export const SettingsPanelOpen = signal(false);

export const ConversionSettings = signal<ConvertOptions>({});

export const SettingsGeneration = signal(0);

export function setSetting(key: string, value: number | string | boolean | undefined) {
  const { [key]: _, ...rest } = ConversionSettings.value;
  ConversionSettings.value = value === undefined ? rest : { ...rest, [key]: value };
}

export function resetSettings() {
  ConversionSettings.value = {};
  SettingsGeneration.value++;
}

export function availableSettings(
  formats: FileFormat[],
  sharedOnly = false,
): Map<string, OptionSpec> {
  const specs = new Map<string, OptionSpec>();
  for (const format of formats) {
    for (const [key, declared] of Object.entries(format.options ?? {})) {
      const shared = Object.hasOwn(Settings, key)
        ? (Settings as Record<string, OptionSpec>)[key]
        : undefined;
      if (sharedOnly && !shared) continue;
      const spec = declared === true ? shared : ({ ...shared, ...declared } as OptionSpec);
      if (!spec) continue;
      const existing = specs.get(key);
      if (!existing) specs.set(key, spec);
      else if (existing.type === "enum" && spec.type === "enum")
        specs.set(key, {
          ...existing,
          values: [...new Set([...existing.values, ...spec.values])],
        });
    }
  }
  return specs;
}

export function applicableSettings(
  specs: Map<string, OptionSpec>,
  settings: ConvertOptions = ConversionSettings.value,
): ConvertOptions {
  return Object.fromEntries(
    Object.entries(settings).filter(([key, value]) => {
      const spec = specs.get(key);
      return spec && isValidOption(spec, value);
    }),
  );
}
