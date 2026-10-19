import type { FileData } from "src/FormatHandler";
import { decode } from "src/common";
// type only: the handler and its decoders load when a check runs, not with the page
import type { AudioSummary } from "src/handlers/audioCheck";

import "./index.css";

const ICON = { ok: "✓", note: "i", warn: "!", bad: "✕" } as const;
const signed = (n: number) => n.toFixed(1).replace("-", "−");

/** The summaries that "Check audio" put into its report pages, in output order. */
export function readSummaries(outputs: FileData[]): AudioSummary[] {
  // the element carries the tool's format id (src/handlers/audioCheck.ts)
  const tag = /<script type="application\/json" id="audio-check">(.*?)<\/script>/s;
  return outputs.flatMap((file) => {
    const json = tag.exec(decode(file.bytes))?.[1];
    return json ? (JSON.parse(json) as AudioSummary[]) : [];
  });
}

function Spectrogram({ summary }: { summary: AudioSummary }) {
  const { spectrogram, nyquist, cutoffHz, name } = summary;
  if (!spectrogram) return <p className="audio-report-empty">No audio could be decoded.</p>;
  const cutoff = cutoffHz && `Content stops at ${(cutoffHz / 1000).toFixed(1)} kHz`;
  return (
    <figure className="audio-report-scope">
      <img
        src={spectrogram}
        alt={`Spectrogram of ${name}, 0 to ${nyquist / 1000} kHz. ${cutoff || "Content reaches the top."}`}
      />
      <ol className="audio-report-axis" aria-hidden="true">
        {[1, 0.5, 0].map((f) => (
          <li key={f}>{Math.round((nyquist * f) / 100) / 10} kHz</li>
        ))}
      </ol>
      {cutoff && (
        <div
          className="audio-report-cutoff"
          aria-hidden="true"
          style={{ bottom: `${(cutoffHz! / nyquist) * 100}%` }}
        >
          <span>{cutoff}</span>
        </div>
      )}
    </figure>
  );
}

function FileReport({ summary }: { summary: AudioSummary }) {
  const { loudness, clippedSamples } = summary;
  const numbers: [string, string][] = [];
  if (loudness) {
    numbers.push(["Loudness", `${signed(loudness.lufs)} LUFS`]);
    numbers.push(["True peak", `${signed(loudness.truePeak)} dBTP`]);
    numbers.push(["Loudness range", `${signed(loudness.range)} LU`]);
  }
  if (clippedSamples !== null) numbers.push(["Clipped samples", clippedSamples.toLocaleString()]);

  return (
    <section className="audio-report-file">
      <Spectrogram summary={summary} />
      <h2>{summary.name}</h2>
      <p className="audio-report-format">{summary.format}</p>
      <p className={`audio-report-verdict level-${summary.level}`}>
        <span aria-hidden="true">{ICON[summary.level]}</span> {summary.verdict}
      </p>
      {summary.findings.length > 0 && (
        <ul className="audio-report-findings">
          {summary.findings.map((finding) => (
            <li key={finding.text} className={`level-${finding.level}`}>
              <span aria-hidden="true">{ICON[finding.level]}</span>
              <span>{finding.text}</span>
            </li>
          ))}
        </ul>
      )}
      {numbers.length > 0 && (
        <dl className="audio-report-numbers">
          {numbers.map(([term, value]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {summary.skipped && <p>{summary.skipped}</p>}
    </section>
  );
}

interface AudioReportProps {
  summaries: AudioSummary[];
  /** Downloads the report pages. */
  onSave: () => void;
}

/** What "Check audio" found, shown in the result dialog instead of downloading at once. */
export default function AudioReport({ summaries, onSave }: AudioReportProps) {
  return (
    <div className="audio-report">
      <div className="audio-report-files">
        {summaries.map((summary) => (
          <FileReport key={summary.name} summary={summary} />
        ))}
      </div>
      <button type="button" className="audio-report-save" onClick={onSave}>
        {summaries.length > 1 ? "Save reports" : "Save report"}
      </button>
    </div>
  );
}
