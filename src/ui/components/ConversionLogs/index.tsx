import { useEffect, useRef } from "preact/hooks";
import { ProgressStore } from "src/ui/ProgressStore";
import "./index.css";

export default function ConversionLogs() {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight;
		}
	}, [ProgressStore.logs.value]);

	return (
		<div className="conversion-logs-inline" ref={containerRef}>
			{ProgressStore.logs.value.length === 0 ? (
				<div className="conversion-logs-empty">No logs available.</div>
			) : (
				ProgressStore.logs.value.map((log, i) => (
					<div key={i} className={`log-entry level-${log.level}`}>
						<span className="log-plugin">[{log.plugin}]</span>
						<span className="log-message">{log.message}</span>
						<span className="log-time">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
					</div>
				))
			)}
		</div>
	);
}
