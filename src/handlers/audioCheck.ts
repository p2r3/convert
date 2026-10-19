import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { FormatDefinition } from "../FormatHandler.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import { AUDIO_FILES, Category } from "src/Formats.ts";
import { changeExt, encode } from "src/common/index.ts";
import { canvasToBlob, createCanvas } from "src/common/canvas.ts";
import { label, SPEC_COLS, SPEC_ROWS, type Finding, type Level } from "./audiocheck/analyze.ts";
import { checkFile, decoderIsExact, type Report } from "./audiocheck/decode.ts";

// its own format, so that picking it is a request for a report rather than a plain HTML page
const AUDIO_CHECK = new FormatDefinition(
  "Audio check report",
  "audio-check",
  "html",
  "text/html",
  Category.TEXT,
);

/** What the report page and the result dialog show of one file. Plain JSON, no typed arrays. */
export interface AudioSummary {
  name: string;
  /** For display, e.g. "FLAC, 44.1 kHz, 16-bit". */
  format: string;
  level: Level;
  /** The short verdict names, such as "Transcode", or "No problems found". */
  verdict: string;
  findings: Finding[];
  /** Half the sample rate: the top of the spectrogram. */
  nyquist: number;
  cutoffHz: number | null;
  loudness: { lufs: number; truePeak: number; range: number } | null;
  clippedSamples: number | null;
  /** The spectrogram as a PNG data URL, lowest frequency at the bottom. */
  spectrogram: string | null;
  /** Set when the browser's decoder isn't bit-exact, so some checks were skipped. */
  skipped: string | null;
}

/** Colour ramp of the spectrogram, quiet to loud, as audiocheck draws it. */
const STOPS = [
  [10, 11, 24],
  [43, 42, 122],
  [180, 38, 107],
  [242, 163, 58],
  [255, 243, 196],
] as const;

async function spectrogramUrl(report: Report): Promise<string | null> {
  if (!report.spectrum) return null;
  const { canvas, ctx } = createCanvas(SPEC_COLS, SPEC_ROWS);
  const pixels = ctx.createImageData(SPEC_COLS, SPEC_ROWS);
  for (let row = 0; row < SPEC_ROWS; row++) {
    for (let col = 0; col < SPEC_COLS; col++) {
      // row 0 of the data is the lowest frequency; the picture has it at the bottom
      const value = report.spectrum.image[(SPEC_ROWS - 1 - row) * SPEC_COLS + col];
      const t = (value / 255) * (STOPS.length - 1);
      const a = STOPS[Math.floor(t)];
      const b = STOPS[Math.min(STOPS.length - 1, Math.floor(t) + 1)];
      const rgb = [0, 1, 2].map((c) => a[c] + (b[c] - a[c]) * (t % 1));
      pixels.data.set([...rgb, 255], (row * SPEC_COLS + col) * 4);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const png = await canvasToBlob({ canvas, ctx }, "image/png");
  return `data:image/png;base64,${btoa(Array.from(png, (byte) => String.fromCharCode(byte)).join(""))}`;
}

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const signed = (n: number) => n.toFixed(1).replace("-", "−");
const ICON: Record<Level, string> = { ok: "✓", note: "i", warn: "!", bad: "✕" };

/** A page that reads on its own, offline, with the summaries as JSON for the result dialog. */
export function reportPage(summaries: AudioSummary[]): string {
  const sections = summaries.map((s) => {
    const numbers = [
      s.cutoffHz && ["Content stops at", `${(s.cutoffHz / 1000).toFixed(1)} kHz`],
      s.loudness && ["Loudness", `${signed(s.loudness.lufs)} LUFS`],
      s.loudness && ["True peak", `${signed(s.loudness.truePeak)} dBTP`],
      s.loudness && ["Loudness range", `${signed(s.loudness.range)} LU`],
      s.clippedSamples !== null && ["Clipped samples", s.clippedSamples.toLocaleString("en")],
    ].filter((row): row is string[] => !!row);
    return `<section>
  <h2>${escape(s.name)}</h2>
  <p class="format">${escape(s.format)}</p>
  ${s.spectrogram ? `<img src="${s.spectrogram}" alt="Spectrogram of ${escape(s.name)}, 0 to ${s.nyquist / 1000} kHz">` : ""}
  <p class="verdict ${s.level}"><span aria-hidden="true">${ICON[s.level]}</span> ${escape(s.verdict)}</p>
  <ul>${s.findings.map((f) => `<li class="${f.level}">${escape(f.text)}</li>`).join("")}</ul>
  <dl>${numbers.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
  ${s.skipped ? `<p class="note">${escape(s.skipped)}</p>` : ""}
</section>`;
  });
  // "<" can't end the script element early once it is escaped
  const json = JSON.stringify(summaries).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audio check: ${escape(summaries.map((s) => s.name).join(", "))}</title>
<style>
  :root { color-scheme: light dark; --ok: #0b6652; --note: #3d43a6; --warn: #8a4b00; --bad: #a8201a; }
  @media (prefers-color-scheme: dark) { :root { --ok: #6fd3b8; --note: #a9aef5; --warn: #f2b45c; --bad: #ff8a80; } }
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 52rem; margin: 2rem auto; padding: 0 1rem; }
  img { width: 100%; image-rendering: pixelated; background: #0a0b18; border-radius: 6px; }
  .format, .note, dt { opacity: 0.75; }
  .verdict { font-weight: 600; font-size: 1.15rem; }
  .ok { color: var(--ok); } .note { color: var(--note); } .warn { color: var(--warn); } .bad { color: var(--bad); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
  dd { margin: 0; font-variant-numeric: tabular-nums; }
  section + section { margin-top: 3rem; }
</style>
</head>
<body>
<h1>Audio check</h1>
${sections.join("\n")}
<script type="application/json" id="audio-check">${json}</script>
</body>
</html>
`;
}

/**
 * Checks music files the way audiocheck does: transcodes sold as lossless, fake hi-res,
 * loudness, clipping and damage.
 */
class audioCheckHandler implements FormatHandler {
  public readonly name = "audioCheck";
  public supportedFormats = [...AUDIO_FILES, AUDIO_CHECK.builder("html").lossless().to()];
  public ready = false;
  // decoding and the loudness meter need an OfflineAudioContext, which workers don't have
  public offload = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const skipped = (await decoderIsExact())
      ? null
      : "This browser does not return exact sample values, so the bit-depth and checksum " +
        "checks were skipped." +
        // Brave Shields scales decoded audio by a small random factor against fingerprinting
        ("brave" in navigator ? " Turning off Brave Shields for this page brings them back." : "");

    const outputFiles: FileData[] = [];
    for (const [i, file] of inputFiles.entries()) {
      ctx?.throwIfAborted();
      ctx?.progress(`Checking ${file.name}...`, i / inputFiles.length);
      const report = await checkFile(new File([file.bytes as BlobPart], file.name));
      const summary: AudioSummary = {
        name: report.name,
        format: report.format,
        level: report.level,
        verdict: report.findings.map(label).filter(Boolean).join(", ") || "No problems found",
        findings: report.findings,
        nyquist: report.sampleRate / 2,
        cutoffHz: report.cutoff?.hz ?? null,
        loudness: report.loudness,
        clippedSamples: report.stats?.clippedSamples ?? null,
        spectrogram: await spectrogramUrl(report),
        skipped,
      };
      outputFiles.push({
        name: changeExt(file.name, "html", "-check"),
        bytes: encode(reportPage([summary])),
      });
    }
    return outputFiles;
  }
}

export default audioCheckHandler;
