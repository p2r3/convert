import { useEffect, useRef, useState } from "preact/hooks";
import { X } from "lucide-preact";

import { Settings, SettingCategories, isValidOption, type OptionSpec } from "src/Settings";
import {
  ConversionSettings,
  SettingsGeneration,
  SettingsPanelOpen,
  applicableSettings,
  resetSettings,
  setSetting,
} from "src/ui/ConversionSettingsStore";
import StyledButton, { ButtonVariant } from "src/ui/components/StyledButton";

import "./index.css";

export const SETTINGS_PANEL_ID = "conversion-settings-panel";
export const SETTINGS_BUTTON_ID = "conversion-settings-button";

function describeRange(spec: OptionSpec & { type: "number" }) {
  const kind = spec.integer ? "a whole number" : "a number";
  if (spec.min !== undefined && spec.max !== undefined)
    return `Enter ${kind} from ${spec.min} to ${spec.max}.`;
  if (spec.min !== undefined) return `Enter ${kind} of at least ${spec.min}.`;
  if (spec.max !== undefined) return `Enter ${kind} of at most ${spec.max}.`;
  return `Enter ${kind}.`;
}

interface FieldProps {
  id: string;
  name: string;
  spec: OptionSpec;
  value: unknown;
}

function NumberField({ id, name, spec, value }: FieldProps & { spec: { type: "number" } }) {
  const [text, setText] = useState(typeof value === "number" ? String(value) : "");
  const [invalid, setInvalid] = useState(false);

  const onInput = (ev: preact.TargetedInputEvent<HTMLInputElement>) => {
    const input = ev.currentTarget;
    setText(input.value);
    if (input.value === "" && !input.validity.badInput) {
      setInvalid(false);
      setSetting(name, undefined);
      return;
    }
    const number = Number(input.value);
    const ok = input.value !== "" && isValidOption(spec, number);
    setInvalid(!ok);
    setSetting(name, ok ? number : undefined);
  };

  return (
    <>
      <div className="settings-field-input">
        <input
          id={id}
          type="number"
          inputMode={spec.integer ? "numeric" : "decimal"}
          min={spec.min}
          max={spec.max}
          step={spec.integer ? 1 : "any"}
          placeholder="Auto"
          value={text}
          onInput={onInput}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
        />
        {spec.unit && (
          <span className="settings-field-unit" aria-hidden="true">
            {spec.unit}
          </span>
        )}
      </div>
      {invalid && (
        <span id={`${id}-error`} className="settings-field-error">
          {describeRange(spec)}
        </span>
      )}
    </>
  );
}

function EnumField({ id, name, spec, value }: FieldProps & { spec: { type: "enum" } }) {
  return (
    <div className="settings-field-input">
      <select
        id={id}
        value={typeof value === "string" && spec.values.includes(value) ? value : ""}
        onChange={(ev) => setSetting(name, ev.currentTarget.value || undefined)}
      >
        <option value="">Auto</option>
        {spec.values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

function StringField({ id, name, spec, value }: FieldProps & { spec: { type: "string" } }) {
  const [text, setText] = useState(typeof value === "string" ? value : "");
  const invalid = text !== "" && !isValidOption(spec, text);

  const onInput = (ev: preact.TargetedInputEvent<HTMLInputElement>) => {
    const next = ev.currentTarget.value;
    setText(next);
    setSetting(name, next !== "" && isValidOption(spec, next) ? next : undefined);
  };

  return (
    <>
      <div className="settings-field-input">
        <input
          id={id}
          type="text"
          placeholder="Auto"
          autoComplete="off"
          spellcheck={false}
          value={text}
          onInput={onInput}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
        />
      </div>
      {invalid && (
        <span id={`${id}-error`} className="settings-field-error">
          {spec.maxLength !== undefined && text.length > spec.maxLength
            ? `Use at most ${spec.maxLength} characters.`
            : "This value isn't in the expected format."}
        </span>
      )}
    </>
  );
}

const BOOLEAN_CHOICES = [
  { label: "Auto", value: undefined },
  { label: "On", value: true },
  { label: "Off", value: false },
];

function BooleanField({ id, name, value }: FieldProps) {
  return (
    <div className="settings-field-choices" role="radiogroup" aria-labelledby={`${id}-label`}>
      {BOOLEAN_CHOICES.map((choice) => (
        <label key={choice.label}>
          <input
            type="radio"
            name={id}
            checked={value === choice.value}
            onChange={() => setSetting(name, choice.value)}
          />
          {choice.label}
        </label>
      ))}
    </div>
  );
}

function Field({ name, spec }: { name: string; spec: OptionSpec }) {
  const id = `conversion-setting-${name}`;
  const value = ConversionSettings.value[name];
  const label = spec.label ?? name;
  const props = { id, name, value };
  return (
    <div className={`settings-field settings-field-${spec.type}`}>
      {spec.type === "boolean" ? (
        <span id={`${id}-label`} className="settings-field-label">
          {label}
        </span>
      ) : (
        <label htmlFor={id} className="settings-field-label">
          {label}
        </label>
      )}
      {spec.type === "enum" ? (
        <EnumField {...props} spec={spec} />
      ) : spec.type === "string" ? (
        <StringField {...props} spec={spec} />
      ) : spec.type === "boolean" ? (
        <BooleanField {...props} spec={spec} />
      ) : (
        <NumberField {...props} spec={spec} />
      )}
    </div>
  );
}

interface SettingsPanelProps {
  specs: Map<string, OptionSpec>;
  formatName?: string;
}

export function closeSettingsPanel() {
  SettingsPanelOpen.value = false;
  requestAnimationFrame(() => document.getElementById(SETTINGS_BUTTON_ID)?.focus());
}

export default function SettingsPanel({ specs, formatName }: SettingsPanelProps) {
  const ref = useRef<HTMLElement>(null);
  const generation = SettingsGeneration.value;
  const activeCount = Object.keys(applicableSettings(specs)).length;

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const order = Object.keys(Settings);
  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length);
  const keys = [...specs.keys()].toSorted((a, b) => rank(a) - rank(b));
  const groups = Object.entries(SettingCategories)
    .map(([category, { label, note }]: [string, { label: string; note?: string }]) => ({
      title: label,
      note,
      keys: keys.filter((key) => (specs.get(key)!.category ?? "other") === category),
    }))
    .filter((group) => group.keys.length);

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape" || ev.defaultPrevented) return;
    ev.preventDefault();
    closeSettingsPanel();
  };

  return (
    <aside
      id={SETTINGS_PANEL_ID}
      ref={ref}
      className="settings-panel"
      aria-labelledby="settings-panel-title"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="settings-panel-header">
        <h2 id="settings-panel-title" className="settings-panel-heading">
          Conversion settings
        </h2>
        {activeCount > 0 && (
          <button type="button" className="settings-panel-reset" onClick={resetSettings}>
            Reset
          </button>
        )}
        <StyledButton
          variant={ButtonVariant.Icon}
          ariaLabel="Close conversion settings"
          onClick={closeSettingsPanel}
        >
          <X size={18} aria-hidden="true" />
        </StyledButton>
      </div>

      <div className="settings-panel-body" key={generation}>
        {!formatName ? (
          <p className="settings-panel-empty">Pick an output format to see its settings.</p>
        ) : specs.size === 0 ? (
          <p className="settings-panel-empty">{formatName} doesn't have any settings.</p>
        ) : (
          groups.map((group) => (
            <section key={group.title} className="settings-panel-section">
              <h3>{group.title}</h3>
              {group.note && <p className="settings-panel-note">{group.note}</p>}
              <div className="settings-panel-fields">
                {group.keys.map((key) => (
                  <Field key={key} name={key} spec={specs.get(key)!} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <div className="settings-panel-footer">
        <StyledButton variant={ButtonVariant.Primary} onClick={closeSettingsPanel}>
          Done
        </StyledButton>
      </div>
    </aside>
  );
}
