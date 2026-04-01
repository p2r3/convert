import { ArrowLeft, ArrowRight, Download, XSquare } from "lucide-preact";
import type { FileFormat } from "src/FormatHandler";
import FileIcon from "src/ui/components/FileIcon";
import FileInfoBadge from "src/ui/components/FileInfo";
import ConversionLogs from "src/ui/components/ConversionLogs";
import "./index.css";
import { ProgressStore } from "src/ui/ProgressStore";

interface LoadingScreenProps {
	fileName: string;
	fileSize?: number;
	from?: FileFormat;
	to?: FileFormat;
	statusText?: string;
	isDone?: boolean;
	fileCount: number;
	onDownload?: () => void;
	onBack?: () => void;
}

export default function LoadingScreen({
	fileName,
	fileSize,
	from,
	to,
	isDone = false,
	fileCount,
	onDownload,
	onBack,
}: LoadingScreenProps) {
	const fromExt = from?.extension?.toUpperCase();
	const toExt = to?.extension?.toUpperCase();

	return (
		<div className="loading-screen">
			<div className="loading-status-area">
				<FileInfoBadge
					fileName={fileName}
					fileSize={fileSize}
					extension={from?.extension}
				/>

				<h2 className="loading-title">
					{ProgressStore.message.value || "Finding conversion route..."}
				</h2>
			</div>

			<div className="loading-metrics-card">
				<div 
					className={`loading-conversion-info ${isDone ? 'is-done' : ''}`}
					style={{
						'--progress': `${ProgressStore.percent.value * 100}%`
					} as any}
				>
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
					{isDone ? (
						<>
							<button className="loading-action-btn secondary" onClick={onBack} title="Back">
								<ArrowLeft size={18} />
								<span>Back</span>
							</button>
							<button className="loading-action-btn primary" onClick={onDownload} title="Download">
								<Download size={18} />
								<span>{fileCount > 1 ? `Download ${fileCount} files` : 'Download'}</span>
							</button>
						</>
					) : (
						<button 
							className="loading-action-btn danger"
							onClick={() => ProgressStore.abort()}
							title="Cancel Conversion"
						>
							<XSquare size={18} />
							<span>Cancel</span>
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
