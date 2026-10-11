import "./index.css";

import { h } from "preact";
import { useState, useMemo, useEffect, useRef } from "preact/hooks";
import {
  ConversionOptions,
  SelectedFiles,
  selectFiles,
  type ConversionOption,
  type ConversionOptionsMap,
} from "src/main";
import { Mode, ModeEnum } from "src/ui/ModeStore";
import type { FileData } from "src/FormatHandler";
import {
  applicableSettings,
  compressorsFor,
  COMPRESS_DEFAULTS,
  sameFormat,
  settingsFor,
  SETTINGS_HANDLERS,
  type SettingKey,
} from "src/ConversionSettings";
import {
  getMatchingFromFormats,
  groupByTarget,
  resolveTargets,
  siblingKeys,
  uniqueNames,
  type Target,
  type TargetGroup,
} from "src/batch";
import { stripExt } from "src/common";

import ConversionHeader from "src/ui/components/Conversion/ConversionHeader";
import FormatExplorer from "src/ui/components/Conversion/FormatExplorer";
import LoadingScreen from "src/ui/components/LoadingScreen";
import Footer from "src/ui/components/Footer";
import { ArrowLeft, ArrowRight, Minimize2, Plus, SlidersHorizontal } from "lucide-preact";
import { PopupData } from "src/ui";
import { openPopup } from "src/ui/PopupStore";
import FileInfoBadge from "src/ui/components/FileInfo";
import { ConversionInProgress, CurrentPage, Pages } from "src/ui/AppState";
import { ProgressStore } from "src/ui/ProgressStore";
import StyledButton, { ButtonVariant } from "src/ui/components/StyledButton";
import ConversionSettingsForm, {
  Settings,
  ZipPassword,
} from "src/ui/components/ConversionSettings";

type ConversionStep = "select-from" | "select-to" | "converting";

const NO_TARGET: Target = { from: null, to: null };

function countAvailableFormats(
  options: ConversionOptionsMap,
  direction: "from" | "to",
  advancedMode: boolean,
): number {
  const seen = new Set<string>();
  let count = 0;

  for (const [format] of options) {
    if (direction === "from" && !format.from) continue;
    if (direction === "to" && !format.to) continue;

    if (advancedMode) {
      count += 1;
      continue;
    }

    const dedupeKey = `${format.mime}|${format.format}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    count += 1;
  }

  return count;
}

function getConversionOptions(): ConversionOptionsMap {
  if (ConversionOptions.size) return ConversionOptions;
  throw new Error("Can't build format list!", { cause: "UI got empty global format list" });
}

function downloadFile(data: Uint8Array | Blob, name: string, type: string) {
  const blob = new Blob([data as BlobPart], { type: type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  // the download needs a moment to start before the URL can be freed
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}

// browsers block all but the first of several automatic downloads, so bundle them
async function downloadAsZip(files: FileData[], name: string, password: string) {
  const { ZipWriter, BlobWriter, Uint8ArrayReader } = await import("@zip.js/zip.js");
  const writer = new ZipWriter(
    new BlobWriter("application/zip"),
    password ? { password, encryptionStrength: 3 } : {},
  );
  // zip.js refuses a second entry with the same name
  const names = uniqueNames(files.map((file) => file.name));
  for (const [i, file] of files.entries()) {
    await writer.add(names[i], new Uint8ArrayReader(file.bytes));
  }
  downloadFile(await writer.close(), name, "application/zip");
}

function totalSize(files: FileData[]) {
  return files.reduce((sum, file) => sum + file.bytes.length, 0);
}

function removeFile(key: string) {
  const { [key as keyof typeof SelectedFiles.value]: _, ...rest } = SelectedFiles.value;
  SelectedFiles.value = rest;
  if (Object.keys(rest).length === 0) CurrentPage.value = Pages.Upload;
}

export default function Conversion() {
  const allOptions = getConversionOptions();
  const entries = useMemo(
    () => Object.entries(SelectedFiles.value) as [string, File][],
    [SelectedFiles.value],
  );
  const isAdvanced = Mode.value === ModeEnum.Advanced;

  // targets the user has touched; resolveTargets derives the rest
  const [stored, setStored] = useState<Record<string, Target>>({});
  const targets = useMemo(
    () => resolveTargets(allOptions, entries, stored, Mode.value === ModeEnum.Simple),
    [allOptions, entries, stored],
  );

  const [chosenKey, setChosenKey] = useState<string>();
  const activeKey = chosenKey && targets[chosenKey] ? chosenKey : entries[0]?.[0];
  const activeFile = entries.find(([key]) => key === activeKey)?.[1];
  const { from: fromOption, to: toOption } = targets[activeKey] ?? NO_TARGET;

  const matchingFrom = useMemo(
    () => getMatchingFromFormats(allOptions, activeFile ? [activeFile] : []),
    [allOptions, activeFile],
  );

  const matchingFromSet = useMemo(() => new Set([...matchingFrom].map(([f]) => f)), [matchingFrom]);

  const [step, setStep] = useState<ConversionStep>(fromOption ? "select-to" : "select-from");
  const [showAll, setShowAll] = useState(false);
  const [applyToAll, setApplyToAll] = useState(true);
  const [isConverting, setIsConverting] = useState(false);
  const [converting, setConverting] = useState<TargetGroup<{ file: File }> | null>(null);

  useEffect(() => {
    if (!activeFile || isConverting) return;
    setStep(fromOption ? "select-to" : "select-from");
    setShowAll(false);
  }, [activeKey]);

  const toSiblings = siblingKeys(entries, targets, activeKey, "to");

  const setOption = (kind: keyof Target, option: ConversionOption | null) => {
    if (!activeKey) return;
    const next = { ...targets };
    const siblings = applyToAll ? siblingKeys(entries, targets, activeKey, kind) : [];
    for (const key of [activeKey, ...siblings]) {
      next[key] = { ...targets[key], [kind]: option };
    }
    setStored(next);
  };

  const handleFromSelect = (option: ConversionOption | null) => setOption("from", option);
  const handleToSelect = (option: ConversionOption | null) => setOption("to", option);

  const handleNext = () => {
    if (step === "select-from" && fromOption) {
      setStep("select-to");
    }
  };

  const handleBack = () => {
    if (step === "select-to") {
      setStep("select-from");
    }
  };

  const handleFromToClickFrom = () => {
    setStep("select-from");
  };

  const handleFromToClickTo = () => {
    setStep("select-to");
  };

  const compressors = fromOption ? compressorsFor(fromOption[0], window.handlerDefs) : [];
  const allReady = entries.every(([key]) => targets[key].from && targets[key].to);

  const handleConvert = async () => {
    if (!allReady) return;

    setIsConverting(true);
    ConversionInProgress.value = true;
    setStep("converting");
    ProgressStore.reset();
    const abortController = ProgressStore.controller;

    try {
      const groups = groupByTarget(
        entries.map(([key, file]) => ({ file, from: targets[key].from!, to: targets[key].to! })),
      );
      const outputs: FileData[] = [];
      const summary: string[] = [];
      let outputMime = "";
      let failed = 0;

      for (const group of groups) {
        abortController.signal.throwIfAborted();
        setConverting(group);

        const [fromFormat, fromHandler] = group.from;
        const [toFormat, toHandler] = group.to;
        const label = `${fromFormat.format.toUpperCase()} → ${toFormat.format.toUpperCase()}`;
        const inputs: FileData[] = [];
        for (const { file } of group.items) {
          inputs.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
        }
        const inputSize = totalSize(inputs);

        const compress = sameFormat(fromFormat, toFormat);
        if (compress && !compressorsFor(toFormat, window.handlerDefs).length) {
          outputs.push(...inputs);
          outputMime = toFormat.mime;
          summary.push(`${label}: already in this format, returned as is.`);
          continue;
        }

        const settings = settingsFor(Settings.value, toFormat, compress ? COMPRESS_DEFAULTS : {});
        const output = await window.tryConvertByTraversing(
          inputs,
          { handler: fromHandler, format: fromFormat },
          { handler: toHandler, format: toFormat },
          abortController.signal,
          settings,
        );

        if (!output) {
          failed++;
          summary.push(`${label}: failed, no working conversion route.`);
          continue;
        }
        outputs.push(...output.files);
        // set here, not earlier, so a group that failed can't label another group's file
        outputMime = toFormat.mime;

        let line = `${label}: via ${output.path.map((c) => c.format.format).join(" → ")}.`;
        if (compress) {
          const saved = 1 - totalSize(output.files) / inputSize;
          line =
            saved > 0
              ? `${label}: ${Math.round(saved * 100)}% smaller.`
              : `${label}: could not be made smaller, original kept.`;
        }
        // a setting that silently did nothing is worse than no setting, above all "remove metadata"
        const lastHandler = output.path.at(-1)?.handler.name ?? "";
        if (Object.keys(settings).length && !SETTINGS_HANDLERS.has(lastHandler)) {
          line += ` The output settings were not applied: ${lastHandler} does not support them.`;
        }
        summary.push(line);
      }

      const password = ZipPassword.value;
      if (outputs.length > 1 || (outputs.length === 1 && password)) {
        const zipName = `${stripExt(entries[0][1].name)}-converted.zip`;
        await downloadAsZip(outputs, zipName, password);
      } else if (outputs.length === 1) {
        downloadFile(outputs[0].bytes, outputs[0].name, outputMime);
      }

      let title = "Conversion complete!";
      if (failed === groups.length) title = "Conversion failed";
      else if (failed) title = "Converted, with failures";
      PopupData.value = {
        dismissible: true,
        buttonText: "OK",
        contents: (
          <>
            <h1>{title}</h1>
            {summary.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </>
        ),
      };
      openPopup();
    } catch (e) {
      console.error(e);
      if (e instanceof Error && e.name === "AbortError") {
        // Don't show an error popup for manual cancellation
      } else {
        PopupData.value = {
          title: "Conversion error",
          text: `An unexpected error occurred: ${e}`,
          dismissible: true,
          buttonText: "OK",
        };
        openPopup();
      }
    } finally {
      setIsConverting(false);
      setConverting(null);
      ConversionInProgress.value = false;
      setStep("select-to");
    }
  };

  const addFileRef = useRef<HTMLInputElement>(null);

  const handleAddClick = (ev: MouseEvent) => {
    ev.preventDefault();
    addFileRef.current?.click();
  };

  const handleAddChange = () => {
    selectFiles(Array.from(addFileRef.current?.files ?? []), true);
    // otherwise picking a file that was removed again fires no change event
    if (addFileRef.current) addFileRef.current.value = "";
  };

  const settingKeys = [
    ...new Set(
      Object.values(targets).flatMap<SettingKey>((t) => (t.to ? applicableSettings(t.to[0]) : [])),
    ),
  ];

  const handleSettingsClick = () => {
    PopupData.value = {
      dismissible: true,
      buttonText: "Done",
      contents: <ConversionSettingsForm keys={settingKeys} />,
    };
    openPopup();
  };

  const canProceed = step === "select-from" ? !!fromOption : allReady;
  const multiple = entries.length > 1;

  return (
    <div className="conversion-body">
      <ConversionHeader logoDisabled={step === "converting"} />

      <main className="conversion-main">
        {step === "converting" ? (
          <LoadingScreen
            fileName={converting?.items[0].file.name || "file"}
            fileSize={converting?.items[0].file.size}
            from={converting?.from[0]}
            to={converting?.to[0]}
          />
        ) : (
          <FormatExplorer
            conversionOptions={allOptions}
            matchingFrom={matchingFromSet}
            onSelect={step === "select-from" ? handleFromSelect : handleToSelect}
            direction={step === "select-from" ? "from" : "to"}
            fromOption={fromOption}
            toOption={toOption}
            fromCount={countAvailableFormats(
              showAll ? allOptions : matchingFrom,
              "from",
              isAdvanced,
            )}
            toCount={countAvailableFormats(allOptions, "to", isAdvanced)}
            onClickFrom={handleFromToClickFrom}
            onClickTo={handleFromToClickTo}
            showAll={showAll}
            onShowAll={() => setShowAll(true)}
          />
        )}
      </main>

      {step !== "converting" &&
        // h() because Preact's JSX types don't know this custom element (built/liquid-glass-ui)
        h(
          "liquid-glass",
          { class: "conversion-dock", refraction: true },
          <div className="conversion-action-bar">
            <div className="conversion-action-files">
              {entries.map(([key, file]) => (
                <FileInfoBadge
                  key={key}
                  fileName={file.name}
                  fileSize={file.size}
                  extension={file.name.split(".").pop()}
                  mimeType={file.type}
                  onRemove={() => removeFile(key)}
                  active={multiple && key === activeKey}
                  target={
                    multiple ? (targets[key]?.to?.[0].format.toUpperCase() ?? "?") : undefined
                  }
                  onClick={multiple ? () => setChosenKey(key) : undefined}
                />
              ))}
              <div
                className="file-info-badge file-info-add"
                onClick={handleAddClick}
                role="button"
                tabIndex={0}
                aria-label="Add more files"
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  addFileRef.current?.click();
                }}
              >
                <input
                  ref={addFileRef}
                  type="file"
                  multiple
                  hidden
                  onClick={(ev) => ev.stopPropagation()}
                  onChange={handleAddChange}
                />
                <Plus size={16} />
              </div>
            </div>
            {step === "select-to" && toSiblings.length > 0 && (
              <label
                className="conversion-apply-all"
                title="Untick to choose a different output for this file only"
              >
                <input
                  type="checkbox"
                  checked={applyToAll}
                  onChange={(ev) => setApplyToAll(ev.currentTarget.checked)}
                />
                All {toSiblings.length + 1} {fromOption?.[0].format.toUpperCase()} files
              </label>
            )}
            {step === "select-to" && compressors.length > 0 && (
              <StyledButton
                onClick={() => handleToSelect(compressors[0])}
                title="Keep the format and make the file smaller"
              >
                <Minimize2 size={16} />
                Compress
              </StyledButton>
            )}
            {step === "select-to" && (
              <StyledButton onClick={handleSettingsClick}>
                <SlidersHorizontal size={16} />
                Settings
              </StyledButton>
            )}
            {step === "select-to" && (
              <StyledButton onClick={handleBack}>
                <ArrowLeft size={16} />
                Back
              </StyledButton>
            )}
            <StyledButton
              variant={ButtonVariant.Primary}
              disabled={!canProceed}
              title={
                step === "select-to" && !allReady ? "Choose an output for every file" : undefined
              }
              onClick={step === "select-from" ? handleNext : handleConvert}
            >
              {step === "select-from" ? "Next" : "Convert"}
              {step === "select-from" && <ArrowRight size={16} />}
            </StyledButton>
          </div>,
        )}

      <Footer />
    </div>
  );
}
