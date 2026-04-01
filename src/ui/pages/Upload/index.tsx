import { useEffect, useRef } from "preact/hooks";
import { LoadingToolsText } from "src/ui/AppState";
import { goToUploadHome } from "src/main.new";
import { Upload } from "lucide-preact";
import { PopupData } from "src/ui";
import { openPopup } from "src/ui/PopupStore";
import { hasSameMimeType, setSelectedFilesAndGoToConversion } from "src/ui/fileSelection";

import Logo from "src/ui/components/Logo";
import HelpButton from "src/ui/components/HelpButton";
import Footer from "src/ui/components/Footer";

import "./index.css";

export default function UploadPage() {
	const fileRef = useRef<HTMLInputElement>(null);

	const handleClick = (ev: MouseEvent) => {
		ev.preventDefault();
		if (!formatsReady) return;
		fileRef.current?.click();
	};

	const formatsReady = LoadingToolsText.value === undefined;

	const processFiles = (fileList: FileList | null | undefined) => {
		if (!fileList || fileList.length === 0) return;
		if (!formatsReady) return;

		const files = Array.from(fileList);
		if (!hasSameMimeType(files)) {
			PopupData.value = {
				title: "Upload failed",
				text: "All input files must be of the same type.",
				dismissible: true,
				buttonText: "OK",
			};
			openPopup();
			return;
		}

		setSelectedFilesAndGoToConversion(files);
	};

	const handleChange = () => {
		processFiles(fileRef.current?.files);
	};

	const handlePaste = (event: ClipboardEvent) => {
		processFiles(event.clipboardData?.files);
	};

	const handleLogoClick = () => {
		goToUploadHome();
		if (fileRef.current) fileRef.current.value = "";
	};

	useEffect(() => {
		window.addEventListener("paste", handlePaste);
		return () => window.removeEventListener("paste", handlePaste);
	}, [formatsReady]);

	return (
		<div className="upload-page">
			<div className="upload-card">
				<div className="upload-card-header">
					<Logo showName={true} size={36} onClick={handleLogoClick} />
				</div>

				<div
					className={`upload-dropzone ${!formatsReady ? "upload-dropzone--pending" : ""}`}
					onClick={handleClick}
					role="button"
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							if (!formatsReady) return;
							fileRef.current?.click();
						}
					}}
				>
					<input
						ref={fileRef}
						type="file"
						multiple
						name="uploadFile"
						id="uploadFile"
						onClick={(ev) => ev.stopPropagation()}
						tabIndex={0}
						disabled={!formatsReady}
						onChange={handleChange}
					/>
					<div className="upload-icon-wrap">
						<Upload />
					</div>
					<span className="upload-cta">Click to upload a file</span>
					<span className="upload-hint">or drag and drop</span>
				</div>

				<div className="upload-card-actions">
					<HelpButton />
				</div>
			</div>

			<Footer loadingText={LoadingToolsText.value} />
		</div>
	);
}
