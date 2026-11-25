import { useEffect, useRef, useState } from "preact/hooks";
import useFirstTabTarget from "src/ui/scripts/useFirstTabTarget";
import { ArrowRight, ChevronDown, Download, Pause, Play, RotateCcw, X } from "lucide-preact";
import type { FileData, FileFormat } from "src/FormatHandler";
import FileIcon from "src/ui/components/FileIcon";
import FileInfoBadge from "src/ui/components/FileInfo";
import ConversionLogs from "src/ui/components/ConversionLogs";
import "./index.css";
import { ProgressStore } from "src/ui/ProgressStore";
import { defaultDownloadMode, downloadFiles, type DownloadMode } from "src/ui/scripts/download";

export type ConversionRunState = "running" | "paused" | "done" | "error";

interface LoadingScreenProps {
  fileName: string;
  fileSize?: number;
  from?: FileFormat;
  to?: FileFormat;
  state: ConversionRunState;
  detail?: string;
  outputFiles?: FileData[];
  archiveName: string;
  onPause: () => void;
  onResume: () => void;
  onDiscard: () => void;
}

const MODE_LABELS: Record<DownloadMode, string> = {
  separate: "Save separately",
  zip: "Save as .zip",
  tar: "Save as .tar",
};

const plural = (n: number) => `${n} file${n === 1 ? "" : "s"}`;

export default function LoadingScreen({
  fileName,
  fileSize,
  from,
  to,
  state,
  detail,
  outputFiles = [],
  archiveName,
  onPause,
  onResume,
  onDiscard,
}: LoadingScreenProps) {
  const mainRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  useFirstTabTarget(state === "running" ? discardRef : mainRef);

  const fromExt = from?.extension?.toUpperCase();
  const toExt = to?.extension?.toUpperCase();
  const count = outputFiles.length;
  const defaultMode = defaultDownloadMode(count);

  useEffect(() => {
    setMenuOpen(false);
    if (state !== "running") mainRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (ev: Event) => {
      if (
        ev instanceof KeyboardEvent
          ? ev.key === "Escape"
          : !(ev.target instanceof Node && menuRef.current?.contains(ev.target))
      )
        setMenuOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  const download = async (mode: DownloadMode) => {
    setMenuOpen(false);
    setDownloading(true);
    try {
      await downloadFiles(outputFiles, mode, archiveName);
    } catch (e) {
      console.error(e);
      ProgressStore.log(
        `Download failed: ${e instanceof Error ? e.message : String(e)}`,
        "error",
        "download",
      );
    } finally {
      setDownloading(false);
    }
  };

  let title: string;
  if (state === "done") title = `Converted ${plural(count)}!`;
  else if (state === "paused") title = "Conversion paused";
  else if (state === "error") title = "Conversion failed";
  else title = ProgressStore.message.value || "Finding conversion route...";

  const percent = state === "done" || state === "error" ? 1 : ProgressStore.percent.value;
  const shownDetail = state === "running" ? undefined : detail;

  let mainButton;
  if (state === "running") {
    mainButton = (
      <button ref={mainRef} className="loading-action-btn main" disabled>
        Converting… {Math.round(percent * 100)}%
      </button>
    );
  } else if (state === "done") {
    mainButton = (
      <div className="loading-download-group" ref={menuRef}>
        <button
          ref={mainRef}
          className="loading-action-btn main success"
          onClick={() => download(defaultMode)}
          disabled={downloading || count === 0}
        >
          <Download size={18} />
          <span>
            {defaultMode === "separate"
              ? `Save ${plural(count)}`
              : `Save ${plural(count)} as .${defaultMode}`}
          </span>
        </button>
        {count > 1 && (
          <button
            className="loading-action-btn success loading-download-more"
            onClick={() => setMenuOpen((open) => !open)}
            disabled={downloading}
            aria-label="Save options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Save options"
          >
            <ChevronDown size={18} />
          </button>
        )}
        {menuOpen && (
          <div className="loading-download-menu" role="menu">
            {(["separate", "zip", "tar"] as const).map((mode) => (
              <button key={mode} role="menuitem" onClick={() => download(mode)}>
                {MODE_LABELS[mode]}
                {mode === defaultMode && <span className="loading-download-default">default</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  } else {
    mainButton = (
      <button ref={mainRef} className="loading-action-btn main primary" onClick={onResume}>
        {state === "paused" ? <Play size={18} /> : <RotateCcw size={18} />}
        <span>{state === "paused" ? "Resume" : "Try again"}</span>
      </button>
    );
  }

  return (
    <div className={`loading-screen state-${state}`}>
      <div className="loading-status-area">
        <FileInfoBadge fileName={fileName} fileSize={fileSize} extension={from?.extension} />

        <h2 className="loading-title" aria-live="polite">
          {title}
        </h2>
        <p className="loading-detail" title={shownDetail}>
          {shownDetail}
        </p>
      </div>

      <div className="loading-metrics-card">
        <div className="loading-conversion-info" style={{ "--progress": `${percent * 100}%` }}>
          {from && (
            <div className="loading-format-pill" aria-hidden="true">
              <FileIcon
                extension={from.extension}
                mimeType={from.mime}
                category={from.category}
                size={18}
              />
              <span className="loading-format-ext">.{fromExt}</span>
            </div>
          )}
          <ArrowRight size={24} className="loading-arrow" aria-hidden="true" />
          {to && (
            <div className="loading-format-pill" aria-hidden="true">
              <FileIcon
                extension={to.extension}
                mimeType={to.mime}
                category={to.category}
                size={18}
              />
              <span className="loading-format-ext">.{toExt}</span>
            </div>
          )}
        </div>

        <ConversionLogs />

        <div className="loading-actions">
          <button
            ref={discardRef}
            className="loading-action-btn icon danger"
            onClick={onDiscard}
            title="Discard and go back"
            aria-label="Discard and go back"
          >
            <X size={18} />
          </button>
          {mainButton}
          {state === "running" && (
            <button
              className="loading-action-btn icon"
              onClick={onPause}
              title="Pause conversion"
              aria-label="Pause conversion"
            >
              <Pause size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
