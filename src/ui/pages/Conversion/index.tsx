import './index.css';

import { useState, useMemo, useCallback, useEffect } from "preact/hooks";
import mime from "mime";
import { Settings2, ArrowLeft, ArrowRight } from "lucide-preact";
import { ConversionOptions, SelectedFiles, downloadFile, type ConversionOption, type ConversionOptionsMap } from 'src/main.new';
import { Mode, ModeEnum } from "src/ui/ModeStore";
import normalizeMimeType from "src/normalizeMimeType";
import type { FileFormat, FormatHandler, HandlerOptionDefinition } from "src/FormatHandler";
import { applyOptionValue, getOptionValues, resetHandlerOptions, shouldShowOption } from "src/HandlerOptions";

import ConversionHeader from "src/ui/components/Conversion/ConversionHeader";
import FormatExplorer from "src/ui/components/Conversion/FormatExplorer";
import HandlerOptionsModal from "src/ui/components/Conversion/HandlerOptionsModal";
import LoadingScreen from "src/ui/components/LoadingScreen";
import Footer from "src/ui/components/Footer";
import { PopupData } from "src/ui";
import { openPopup } from "src/ui/PopupStore";
import FileInfoBadge from "src/ui/components/FileInfo";
import { ConversionInProgress, CurrentPage, Pages } from "src/ui/AppState";
import { ProgressStore } from "src/ui/ProgressStore";
import StyledButton, { ButtonVariant } from "src/ui/components/StyledButton";

type ConversionStep = "select-from" | "select-to" | "converting";

function countAvailableFormats(options: ConversionOptionsMap, direction: "from" | "to", advancedMode: boolean): number {
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

function countUniqueFormats(options: ConversionOptionsMap): number {
	const seen = new Set<string>();
	for (const [format] of options) {
		const dedupeKey = `${format.mime}|${format.format}`;
		seen.add(dedupeKey);
	}
	return seen.size;
}

function getConversionOptions(): ConversionOptionsMap {
	if (ConversionOptions.size) return ConversionOptions;
	throw new Error("Can't build format list!", { cause: "UI got empty global format list" });
}

function expandVideoContainerMimes(candidates: string[]): string[] {
	const out = new Set(candidates);
	for (const c of candidates) {
		if (c === "video/mp4" || c === "video/quicktime") {
			out.add("video/mp4");
			out.add("video/quicktime");
		}
	}
	return [...out];
}

function getMimeCandidatesForFile(file: File): string[] {
	const set = new Set<string>();
	const raw = file.type?.trim();
	if (raw) set.add(normalizeMimeType(raw));
	const fromPath = mime.getType(file.name);
	if (fromPath) set.add(normalizeMimeType(fromPath));
	const extOnly = file.name.split(".").pop()?.toLowerCase();
	if (extOnly) {
		const fromExt = mime.getType(extOnly);
		if (fromExt) set.add(normalizeMimeType(fromExt));
	}
	return expandVideoContainerMimes([...set]);
}

function formatMatchesUploadedFile(format: FileFormat, ext: string, mimeCandidates: string[]): boolean {
	if (mimeCandidates.includes(format.mime)) return true;
	if (!ext) return false;
	const normalizeExt = (value: string) => value.toLowerCase() === "midi" ? "mid" : value.toLowerCase();
	const e = normalizeExt(ext);
	const fex = format.extension.toLowerCase();
	const fmt = format.format.toLowerCase();
	const intr = format.internal.toLowerCase();
	return (
		normalizeExt(fex) === e
		|| normalizeExt(fex).includes(e)
		|| normalizeExt(fmt) === e
		|| normalizeExt(fmt).includes(e)
		|| normalizeExt(intr) === e
		|| normalizeExt(intr).includes(e)
	);
}

function getMatchingFromFormats(options: ConversionOptionsMap, files: File[]): ConversionOptionsMap {
	if (files.length === 0) return options;

	const file = files[0];
	const mimeCandidates = getMimeCandidatesForFile(file);
	const ext = file.name.split(".").pop()?.toLowerCase() || "";
	const matched: ConversionOptionsMap = new Map();

	for (const [format, handler] of options) {
		if (!format.from) continue;
		if (formatMatchesUploadedFile(format, ext, mimeCandidates)) {
			matched.set(format, handler);
		}
	}

	return matched.size > 0 ? matched : options;
}

function hasConfigurableOptions(handler: FormatHandler): boolean {
	return (handler.getOptions?.().length ?? 0) > 0;
}

export default function Conversion() {
	const allOptions = getConversionOptions();
	const files = Object.values(SelectedFiles.value);
	const firstFile = files[0];
	const isAdvanced = Mode.value === ModeEnum.Advanced;

	const matchingFrom = useMemo(
		() => getMatchingFromFormats(allOptions, files),
		[allOptions, files]
	);

	const autoAdvance = useMemo(() => {
		if (!matchingFrom.size) return false;
		const isSimple = Mode.value === ModeEnum.Simple;
		if (!isSimple) return matchingFrom.size === 1;
		return countUniqueFormats(matchingFrom) === 1;
	}, [matchingFrom, Mode.value]);

	const [step, setStep] = useState<ConversionStep>(() => {
		if (autoAdvance) return "select-to";
		return "select-from";
	});

	const [fromOption, setFromOption] = useState<ConversionOption | null>(() => {
		if (autoAdvance) {
			const first = matchingFrom.entries().next().value;
			return first ? [first[0], first[1]] : null;
		}
		return null;
	});

	const [toOption, setToOption] = useState<ConversionOption | null>(null);
	const [isConverting, setIsConverting] = useState(false);
	const [isConversionDone, setIsConversionDone] = useState(false);
	const [outputFiles, setOutputFiles] = useState<Array<{ name: string; bytes: Uint8Array }>>([]);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [optionRenderNonce, setOptionRenderNonce] = useState(0);
	const activeInputHandler = isAdvanced ? fromOption?.[1] ?? null : null;
	const activeOutputHandler = isAdvanced ? toOption?.[1] ?? null : null;

	const inputSettingsOptions = useMemo(
		() => activeInputHandler?.getOptions?.() ?? [],
		[activeInputHandler, optionRenderNonce]
	);
	const outputSettingsOptions = useMemo(
		() => activeOutputHandler?.getOptions?.() ?? [],
		[activeOutputHandler, optionRenderNonce]
	);
	const inputSettingsValues = useMemo(
		() => activeInputHandler ? getOptionValues(activeInputHandler) : {},
		[activeInputHandler, optionRenderNonce]
	);
	const outputSettingsValues = useMemo(
		() => activeOutputHandler ? getOptionValues(activeOutputHandler) : {},
		[activeOutputHandler, optionRenderNonce]
	);
	const inputVisibleOptions = useMemo(
		() => inputSettingsOptions.filter(option => shouldShowOption(option, inputSettingsValues)),
		[inputSettingsOptions, inputSettingsValues]
	);
	const outputVisibleOptions = useMemo(
		() => outputSettingsOptions.filter(option => shouldShowOption(option, outputSettingsValues)),
		[outputSettingsOptions, outputSettingsValues]
	);
	const canOpenSettings = isAdvanced && step === "select-to" && !!fromOption && !!toOption && (
		(activeInputHandler ? hasConfigurableOptions(activeInputHandler) : false)
		|| (activeOutputHandler ? hasConfigurableOptions(activeOutputHandler) : false)
	);

	useEffect(() => {
		if (!firstFile || isConverting) return;

		if (autoAdvance) {
			const first = matchingFrom.entries().next().value;
			setFromOption(first ? [first[0], first[1]] : null);
			setStep("select-to");
		} else {
			setFromOption(null);
			setStep("select-from");
		}

		setToOption(null);
	}, [firstFile]);

	useEffect(() => {
		if (step === "converting") {
			setSettingsOpen(false);
		}
	}, [step]);

	const handleFromSelect = useCallback((option: ConversionOption | null) => {
		setFromOption(option);
		if (!option) setToOption(null);
	}, []);

	const handleToSelect = useCallback((option: ConversionOption | null) => {
		setToOption(option);
	}, []);

	const handleNext = () => {
		if (step === "select-from" && fromOption) {
			setStep("select-to");
			setToOption(null);
		}
	};

	const handleBack = () => {
		if (step === "select-to") {
			setStep("select-from");
			setToOption(null);
		}
	};

	const handleFromToClickFrom = () => {
		setStep("select-from");
		setFromOption(null);
		setToOption(null);
	};

	const handleFromToClickTo = () => {
		setStep("select-to");
		setToOption(null);
	};

	const removeFile = (key: string) => {
		const { [key as keyof typeof SelectedFiles.value]: _, ...rest } = SelectedFiles.value;
		SelectedFiles.value = rest;
		if (Object.keys(rest).length === 0) CurrentPage.value = Pages.Upload;
	};

	const handleConvert = async () => {
		if (!fromOption || !toOption || !firstFile) return;
		setIsConverting(true);
		setIsConversionDone(false);
		setOutputFiles([]);
		ConversionInProgress.value = true;
		setStep("converting");
		ProgressStore.reset();
		const abortController = ProgressStore.controller;

		try {
			const inputFileData = [];
			for (const f of files) {
				const buf = await f.arrayBuffer();
				const bytes = new Uint8Array(buf);
				inputFileData.push({ name: f.name, bytes });
			}

			const fromNode = { handler: fromOption[1], format: fromOption[0] };
			const toNode = { handler: toOption[1], format: toOption[0] };

			if (
				fromNode.format.mime === toNode.format.mime
				&& fromNode.format.format === toNode.format.format
				&& fromNode.handler.name === toNode.handler.name
			) {
				setOutputFiles(inputFileData);
				setIsConversionDone(true);
				ProgressStore.progress("Conversion successful.", 1);
				return;
			}

			const output = await window.tryConvertByTraversing(
				inputFileData,
				fromNode,
				toNode,
				abortController.signal
			);

			if (!output) {
				setIsConverting(false);
				setStep("select-to");
				PopupData.value = {
					title: "Conversion failed",
					text: "Could not find a valid conversion route between these formats.",
					dismissible: true,
					buttonText: "OK",
				};
				openPopup();
				return;
			}

			setOutputFiles(output.files);
			setIsConversionDone(true);
			ProgressStore.progress("Conversion successful.", 1);
		} catch (e) {
			console.error(e);
			if (e instanceof DOMException && e.name === "AbortError") {
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
			ConversionInProgress.value = false;
		}
	};

	const handleDownloadOutput = useCallback(() => {
		if (!toOption || outputFiles.length === 0) return;
		for (const file of outputFiles) {
			downloadFile(file.bytes, file.name, toOption[0].mime);
		}
	}, [outputFiles, toOption]);

	const handleBackFromConverting = useCallback(() => {
		setIsConversionDone(false);
		setOutputFiles([]);
		setStep("select-to");
	}, []);

	const handleApplyOption = useCallback((handler: FormatHandler, option: HandlerOptionDefinition, value: unknown) => {
		applyOptionValue(handler, option, value);
		setOptionRenderNonce(n => n + 1);
	}, []);

	const handleResetHandler = useCallback((handler: FormatHandler) => {
		resetHandlerOptions(handler);
		setOptionRenderNonce(n => n + 1);
	}, []);

	const canProceed = step === "select-from" ? !!fromOption : !!toOption;

	return (
		<div className="conversion-body">
			<ConversionHeader logoDisabled={step === "converting"} />

			<main className="conversion-main">
				{step === "converting" ? (
					<LoadingScreen
						fileName={firstFile?.name || "file"}
						fileSize={firstFile?.size}
						from={fromOption?.[0]}
						to={toOption?.[0]}
						isDone={isConversionDone}
						fileCount={outputFiles.length}
						onDownload={handleDownloadOutput}
						onBack={handleBackFromConverting}
					/>
				) : (
					<FormatExplorer
						conversionOptions={step === "select-from" ? matchingFrom : allOptions}
						onSelect={step === "select-from" ? handleFromSelect : handleToSelect}
						filterDirection={step === "select-from" ? "from" : "to"}
						fromOption={fromOption}
						toOption={toOption}
						fromCount={countAvailableFormats(matchingFrom, "from", isAdvanced)}
						toCount={countAvailableFormats(allOptions, "to", isAdvanced)}
						onClickFrom={handleFromToClickFrom}
						onClickTo={handleFromToClickTo}
					/>
				)}
			</main>

			<HandlerOptionsModal
				open={settingsOpen && step !== "converting"}
				inputHandler={activeInputHandler}
				outputHandler={activeOutputHandler}
				inputVisibleOptions={inputVisibleOptions}
				outputVisibleOptions={outputVisibleOptions}
				onApplyOption={handleApplyOption}
				onResetHandler={handleResetHandler}
				onClose={() => setSettingsOpen(false)}
			/>

			{step !== "converting" && (
				<div className="conversion-action-bar">
					<div className="conversion-action-files">
						{Object.entries(SelectedFiles.value).map(([key, file]) => (
							<FileInfoBadge
								key={key}
								fileName={file.name}
								fileSize={file.size}
								extension={file.name.split(".").pop()}
								mimeType={file.type}
								onRemove={() => removeFile(key)}
							/>
						))}
					</div>
					{step === "select-to" && (
						<StyledButton onClick={handleBack}>
							<ArrowLeft size={16} />
							Back
						</StyledButton>
					)}
					{canOpenSettings && (
						<StyledButton
							variant={ButtonVariant.Icon}
							title={settingsOpen ? "Close settings" : "Open settings"}
							onClick={() => setSettingsOpen(prev => !prev)}
						>
							<Settings2 size={16} />
						</StyledButton>
					)}
					<StyledButton
						variant={ButtonVariant.Primary}
						disabled={!canProceed}
						onClick={step === "select-from" ? handleNext : handleConvert}
					>
						{step === "select-from" ? "Next" : "Convert"}
						{step === "select-from" && <ArrowRight size={16} />}
					</StyledButton>
				</div>
			)}

			<Footer />
		</div>
	);
}
