import type { CategoryType } from "src/Formats";
import FileIcon from "src/ui/components/FileIcon";
import { X } from "lucide-preact";
import "./index.css";

interface FileInfoBadgeProps {
  fileName: string;
  fileSize?: number;
  extension?: string;
  mimeType?: string;
  category?: CategoryType | CategoryType[];
  onRemove?: () => void;
  className?: string;
  /** Marks the badge as the file currently being configured. */
  active?: boolean;
  /** Short name of the format the file will be converted to. */
  target?: string;
  /** Makes the badge selectable. */
  onClick?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function FileInfoBadge({
  fileName,
  fileSize,
  extension,
  mimeType,
  category,
  onRemove,
  className = "",
  active,
  target,
  onClick,
}: FileInfoBadgeProps) {
  const ext = extension || fileName.split(".").pop() || "";

  return (
    <div
      className={`file-info-badge ${className} ${active ? "file-info-active" : ""}`}
      {...(onClick && {
        onClick,
        role: "button",
        tabIndex: 0,
        "aria-pressed": !!active,
        style: { cursor: "pointer" },
        onKeyDown: (e: KeyboardEvent) => {
          if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
          e.preventDefault();
          onClick();
        },
      })}
    >
      <FileIcon extension={ext} mimeType={mimeType} category={category} size={16} />
      <div className="file-info-text">
        <span className="file-info-name">{fileName}</span>
        {(typeof fileSize === "number" || target) && (
          <span className="file-info-size">
            {typeof fileSize === "number" && formatFileSize(fileSize)}
            {target && ` → ${target}`}
          </span>
        )}
      </div>
      {onRemove && (
        <button
          className="file-info-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove file"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
