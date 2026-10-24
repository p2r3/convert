import { useEffect, useRef } from "preact/hooks";
import { CurrentPage, LoadingToolsText, Pages } from "src/ui/AppState";
import { goToUploadHome, SelectedFiles } from "src/main";
import { Upload } from "lucide-preact";
import { PopupData } from "src/ui";
import { openPopup } from "src/ui/PopupStore";

import Logo from "src/ui/components/Logo";
import HelpButton from "src/ui/components/HelpButton";
import Footer from "src/ui/components/Footer";
import StyledButton from "src/ui/components/StyledButton";

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

    const sameMime = files.every((file) => file.type === files[0].type);
    if (!sameMime) {
      PopupData.value = {
        title: "Invalid selection",
        text: "All input files must be of the same type.",
        dismissible: true,
        buttonText: "OK",
      };
      openPopup();
      return;
    }

    SelectedFiles.value = Object.fromEntries(
      files.map((file) => [`${file.name}-${file.lastModified}`, file]),
    );
    CurrentPage.value = Pages.Conversion;
  };

  const handleChange = () => {
    processFiles(fileRef.current?.files);
  };

  const handlePaste = (event: ClipboardEvent) => {
    processFiles(event.clipboardData?.files);
  };

  const handleLogoClick = (event: MouseEvent) => {
    (event.currentTarget as HTMLButtonElement)
      .querySelector(".logo-icon svg")
      ?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(-720deg)" }], {
        duration: 1000,
        easing: "cubic-bezier(0.33, 1, 0.68, 1)",
      });
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
          <span className="upload-cta">
            {window.matchMedia("(pointer: coarse)").matches ? "Tap" : "Click"} to select a file
          </span>
          <span className="upload-hint">
            {window.matchMedia("(pointer: coarse)").matches ? "" : "or drag and drop"}
          </span>
        </div>

        <div className="upload-card-actions">
          <HelpButton />
          <StyledButton
            onClick={() => {
              if (!formatsReady) return;
              CurrentPage.value = Pages.Conversion;
            }}
            disabled={!formatsReady}
          >
            View formats
          </StyledButton>
        </div>
      </div>

      <Footer loadingText={LoadingToolsText.value} />
    </div>
  );
}
