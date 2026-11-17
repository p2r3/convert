import { signal } from "@preact/signals";

import type { FileFormat, HandlerDefinition } from "src/FormatHandler";
import {
  Settings,
  isShared,
  isValidOption,
  qualifyKey,
  type ConvertOptions,
  type OptionSpec,
} from "src/Settings";

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
  outputs: [FileFormat, HandlerDefinition][],
  sharedOnly = false,
): Map<string, OptionSpec> {
  const specs = new Map<string, OptionSpec>();
  for (const [format, handler] of outputs) {
    for (const [key, declared] of Object.entries(format.options ?? {})) {
      const shared = isShared(key) ? (Settings as Record<string, OptionSpec>)[key] : undefined;
      if (sharedOnly && !shared) continue;
      const spec = declared === true ? shared : { ...shared, ...declared };
      if (!spec) continue;
      const name = qualifyKey(handler.name, key);
      const existing = specs.get(name);
      if (!existing) specs.set(name, spec);
      else if (existing.type === "enum" && spec.type === "enum")
        specs.set(name, {
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
