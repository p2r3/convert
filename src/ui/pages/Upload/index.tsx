import { useRef } from "preact/hooks";
import { LoadingToolsText } from "src/ui/AppState";
import { goToUploadHome, selectFiles } from "src/main";
import { Upload } from "lucide-preact";

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

  const handleChange = () => {
    if (!formatsReady) return;
    selectFiles(Array.from(fileRef.current?.files ?? []));
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
            tabIndex={-1}
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
        </div>
      </div>

      <Footer loadingText={LoadingToolsText.value} />
    </div>
  );
}
