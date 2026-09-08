import FileIcon from "src/ui/components/FileIcon";
import { X } from "lucide-preact";
import "./index.css";

interface FileInfoBadgeProps {
	fileName: string;
	fileSize?: number;
	extension?: string;
	mimeType?: string;
	category?: string | string[];
	onRemove?: () => void;
	className?: string;
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
	className = ""
}: FileInfoBadgeProps) {
	const ext = extension || fileName.split(".").pop() || "";

	return (
		<div className={`file-info-badge ${className}`}>
			<FileIcon extension={ext} mimeType={mimeType} category={category} size={16} />
			<div className="file-info-text">
				<span className="file-info-name">{fileName}</span>
				{typeof fileSize === "number" && (
					<span className="file-info-size">{formatFileSize(fileSize)}</span>
				)}
			</div>
			{onRemove && (
				<button
					className="file-info-remove"
					onClick={(e) => { e.stopPropagation(); onRemove(); }}
					aria-label="Remove file"
				>
					<X size={14} />
				</button>
			)}
		</div>
	);
}
