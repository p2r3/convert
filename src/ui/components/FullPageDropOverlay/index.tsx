import { useEffect, useRef, useState } from "preact/hooks";
import { Upload } from "lucide-preact";

import { ConversionInProgress, LoadingToolsText } from "src/ui/AppState";
import { PopupData } from "src/ui";
import { openPopup } from "src/ui/PopupStore";
import { hasSameMimeType, setSelectedFilesAndGoToConversion } from "src/ui/fileSelection";

import "./index.css";

function getDraggedFiles(dataTransfer: DataTransfer | null): File[] | null {
	if (!dataTransfer) return null;

	if (dataTransfer.items && dataTransfer.items.length > 0) {
		const fileItems = Array.from(dataTransfer.items).filter((item) => item.kind === "file");
		if (fileItems.length === 0) return null;

		const files: File[] = [];
		for (const item of fileItems) {
			const entry = item.webkitGetAsEntry();
			if (entry?.isDirectory) return null;
			const file = item.getAsFile();
			if (file) files.push(file);
		}
		return files.length > 0 ? files : null;
	}

	return dataTransfer.files.length > 0 ? Array.from(dataTransfer.files) : null;
}

function getDragPreviewState(dataTransfer: DataTransfer | null): { valid: boolean; name: string | null } {
	if (!dataTransfer) return { valid: false, name: null };

	if (dataTransfer.items && dataTransfer.items.length > 0) {
		const fileItems = Array.from(dataTransfer.items).filter((item) => item.kind === "file");
		if (fileItems.length === 0) return { valid: false, name: null };
		for (const item of fileItems) {
			const entry = item.webkitGetAsEntry();
			if (entry?.isDirectory) return { valid: false, name: null };
		}
		const first = fileItems[0];
		const previewName = first.getAsFile()?.name || first.type || null;
		return { valid: true, name: previewName };
	}

	if (dataTransfer.files.length >= 1) {
		return { valid: true, name: dataTransfer.files[0]?.name ?? null };
	}
	return { valid: true, name: null };
}

export default function FullPageDropOverlay() {
	const [isDragging, setIsDragging] = useState(false);
	const [draggedFileName, setDraggedFileName] = useState<string | null>(null);
	const dragCounter = useRef(0);

	const formatsReady = LoadingToolsText.value === undefined;
	const canAcceptDrop = formatsReady && !ConversionInProgress.value;

	useEffect(() => {
		const isFileDrag = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

		const handleDragEnter = (event: DragEvent) => {
			if (!isFileDrag(event)) return;
			event.preventDefault();

			dragCounter.current += 1;
			if (!canAcceptDrop) return;

			const preview = getDragPreviewState(event.dataTransfer);
			if (!preview.valid) return;
			setDraggedFileName(preview.name);
			setIsDragging(true);
		};

		const handleDragOver = (event: DragEvent) => {
			if (!isFileDrag(event)) return;
			event.preventDefault();
			if (!canAcceptDrop) return;
			const preview = getDragPreviewState(event.dataTransfer);
			if (!preview.valid) {
				setIsDragging(false);
				setDraggedFileName(null);
				return;
			}
			setDraggedFileName(preview.name);
			setIsDragging(true);
		};

		const handleDragLeave = (event: DragEvent) => {
			if (!isFileDrag(event)) return;
			event.preventDefault();

			dragCounter.current = Math.max(0, dragCounter.current - 1);
			if (dragCounter.current > 0) return;

			setIsDragging(false);
			setDraggedFileName(null);
		};

		const handleDrop = (event: DragEvent) => {
			if (!isFileDrag(event)) return;
			event.preventDefault();

			dragCounter.current = 0;
			setIsDragging(false);

			if (!canAcceptDrop) {
				setDraggedFileName(null);
				return;
			}

			const files = getDraggedFiles(event.dataTransfer);

			if (!files || files.length === 0) {
				setDraggedFileName(null);
				return;
			}

			if (!hasSameMimeType(files)) {
				PopupData.value = {
					title: "Upload failed",
					text: "All input files must be of the same type.",
					dismissible: true,
					buttonText: "OK",
				};
				openPopup();
				setDraggedFileName(null);
				return;
			}

			setSelectedFilesAndGoToConversion(files);
			setDraggedFileName(null);
		};

		window.addEventListener("dragenter", handleDragEnter);
		window.addEventListener("dragover", handleDragOver);
		window.addEventListener("dragleave", handleDragLeave);
		window.addEventListener("drop", handleDrop);

		return () => {
			window.removeEventListener("dragenter", handleDragEnter);
			window.removeEventListener("dragover", handleDragOver);
			window.removeEventListener("dragleave", handleDragLeave);
			window.removeEventListener("drop", handleDrop);
		};
	}, [canAcceptDrop]);

	if (!isDragging || !canAcceptDrop) return null;

	return (
		<div className="full-page-drop-overlay" aria-hidden="true">
			<div className="full-page-drop-overlay-card">
				<div className="full-page-drop-overlay-icon">
					<Upload />
				</div>
				<p className="full-page-drop-overlay-title">Drop to upload</p>
				<p className="full-page-drop-overlay-subtitle">
					Release to convert your file
				</p>
				{draggedFileName && (
					<div className="full-page-drop-overlay-chip" role="status">
						<Upload size={14} />
						<span>{draggedFileName}</span>
					</div>
				)}
			</div>
		</div>
	);
}
