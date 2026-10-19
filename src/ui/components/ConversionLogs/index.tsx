import { useEffect, useRef } from "preact/hooks";
import { ProgressStore } from "src/ui/ProgressStore";
import "./index.css";

/**
 * Lines kept on screen. A search that fails through dozens of routes logs thousands of lines,
 * and drawing all of them again for every new one took longer than the conversions did.
 */
const SHOWN = 300;

// one formatter for every line: toLocaleTimeString builds a new one on each call
const TIME = new Intl.DateTimeFormat([], {
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export default function ConversionLogs() {
  const containerRef = useRef<HTMLDivElement>(null);
  const logs = ProgressStore.logs.value;
  const first = Math.max(0, logs.length - SHOWN);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="conversion-logs-inline" ref={containerRef}>
      {logs.length === 0 ? (
        <div className="conversion-logs-empty">No logs available.</div>
      ) : (
        // keyed by the line's place in the whole log, so that a new line moves no other
        logs.slice(first).map((log, i) => (
          <div key={first + i} className={`log-entry level-${log.level}`}>
            <span className="log-plugin">[{log.plugin}]</span>
            <span className="log-message">{log.message}</span>
            <span className="log-time">{TIME.format(log.timestamp)}</span>
          </div>
        ))
      )}
    </div>
  );
}
