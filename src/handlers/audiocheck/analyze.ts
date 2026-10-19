// Copied from github.com/Gitguy268/audiocheck (MIT) at bbc7879. Change it there and copy it again.
// Pure measurements and the rules that turn them into findings. No DOM, so node can test it.
import FFT from "fft.js";
import { md5 } from "@noble/hashes/legacy.js";

export const FFT_SIZE = 8192;
export const BAND_HZ = 50;
export const SPEC_COLS = 480;
export const SPEC_ROWS = 160;
/** The spectrogram maps this dB range (relative to a full-scale sine) onto 0..255. */
export const SPEC_DB = [-130, -20] as const;
// Longer files are sampled at this many evenly spaced frames instead of every frame.
const MAX_FRAMES = 6000;

export interface Spectrum {
  /** Mean level per 50 Hz band, in dB relative to a full-scale sine. */
  bands: Float32Array;
  /** SPEC_COLS x SPEC_ROWS, row 0 is the lowest frequency. */
  image: Uint8Array;
}

export function analyzeSpectrum(channels: readonly Float32Array[], sampleRate: number): Spectrum {
  const n = FFT_SIZE;
  const half = n / 2;
  const length = channels[0]?.length ?? 0;
  const frames = Math.min(MAX_FRAMES, Math.max(1, Math.floor((length - n) / half) + 1));
  const step = frames > 1 ? (length - n) / (frames - 1) : 0;

  const fft = new FFT(n);
  const window = new Float64Array(n);
  for (let i = 0; i < n; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  const input = new Float64Array(n);
  const out = new Float64Array(2 * n);
  const sum = new Float64Array(half);
  const column = new Float64Array(SPEC_ROWS);
  const cells = new Float64Array(SPEC_COLS * SPEC_ROWS);

  for (let f = 0; f < frames; f++) {
    const start = Math.round(f * step);
    column.fill(0);
    for (const data of channels) {
      for (let i = 0; i < n; i++) input[i] = (data[start + i] ?? 0) * window[i]!;
      fft.realTransform(out, input);
      for (let k = 0; k < half; k++) {
        const p = out[2 * k]! ** 2 + out[2 * k + 1]! ** 2;
        sum[k]! += p;
        const row = Math.floor((k * SPEC_ROWS) / half);
        if (p > column[row]!) column[row] = p;
      }
    }
    const c0 = Math.floor((f * SPEC_COLS) / frames);
    const c1 = Math.max(c0 + 1, Math.floor(((f + 1) * SPEC_COLS) / frames));
    for (let c = c0; c < c1; c++) {
      for (let r = 0; r < SPEC_ROWS; r++) {
        const i = r * SPEC_COLS + c;
        if (column[r]! > cells[i]!) cells[i] = column[r]!;
      }
    }
  }

  // A full-scale sine through a Hann window peaks at n/4.
  const full = (n / 4) ** 2;
  const binHz = sampleRate / n;
  const bands = new Float32Array(Math.floor(sampleRate / 2 / BAND_HZ));
  for (let b = 0; b < bands.length; b++) {
    const k0 = Math.ceil((b * BAND_HZ) / binHz);
    const k1 = Math.max(k0 + 1, Math.ceil(((b + 1) * BAND_HZ) / binHz));
    let p = 0;
    for (let k = k0; k < k1 && k < half; k++) p += sum[k]!;
    bands[b] = 10 * Math.log10(p / (k1 - k0) / (frames * channels.length) / full + 1e-20);
  }
  const image = new Uint8Array(cells.length);
  const [lo, hi] = SPEC_DB;
  for (let i = 0; i < cells.length; i++) {
    const db = 10 * Math.log10(cells[i]! / full + 1e-20);
    image[i] = Math.max(0, Math.min(255, Math.round(((db - lo) / (hi - lo)) * 255)));
  }
  return { bands, image };
}

export interface Cutoff {
  hz: number;
  /** How far the level falls across the edge, in dB. */
  dropDb: number;
}

function median(a: Float32Array, from: number, to: number): number {
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts the copy that slice made
  const s = a.slice(Math.max(0, from), to).sort();
  return s[s.length >> 1] ?? -Infinity;
}

// The edge a low-pass filter leaves: a plateau, then at least this much quieter within about 1 kHz.
const MIN_DROP_DB = 20;

/**
 * Looks from the top of the band downwards for the highest sharp edge with nothing above it.
 * The idea (walk down from Nyquist, look for a steep step in the smoothed, averaged spectrum)
 * follows fakeflac by Maurits van der Schee (MIT). Medians are used instead of single points
 * so that a lone tone, like a 19 kHz pilot, is not read as an edge.
 */
export function findCutoff(bands: Float32Array): Cutoff | null {
  const after = 300 / BAND_HZ;
  const gap = 600 / BAND_HZ;
  const before = 500 / BAND_HZ;
  for (let i = bands.length - after; i >= 5000 / BAND_HZ && i >= gap + before; i--) {
    const above = median(bands, i, i + after);
    const below = median(bands, i - gap - before, i - gap);
    if (below - above < MIN_DROP_DB) continue;
    // Content that comes back higher up makes this a dip, not the end of the band.
    if (median(bands, i, bands.length) > below - 15) continue;
    // `i` is the foot of the slope, and a resampler's slope can be several kHz long. First
    // take the music's own tilt from a stretch well below, then climb until the level stops
    // rising faster than that tilt plus 1 dB per 500 Hz: that is the plateau.
    const kHz = 1000 / BAND_HZ;
    const span = kHz / 2;
    const tilt =
      i < 9 * kHz
        ? 0
        : (median(bands, i - 6 * kHz, i - 5 * kHz) - median(bands, i - 9 * kHz, i - 8 * kHz)) /
          (3 * kHz);
    let top = i - gap;
    while (
      top > 2 * span &&
      median(bands, top - 2 * span, top - span) - median(bands, top - span, top) > 1 - tilt * span
    )
      top--;
    const plateau = median(bands, top - 2 * span, top - span);
    // The edge is where the level is 6 dB under the plateau's trend, which is where a
    // windowed-sinc filter (resamplers, encoders) has its nominal cutoff.
    let j = top - span;
    while (j < i && bands[j]! >= plateau + tilt * (j - (top - 1.5 * span)) - 6) j++;
    return { hz: j * BAND_HZ, dropDb: plateau - above };
  }
  return null;
}

// LAME's default low-pass per constant bitrate (libmp3lame/lame.c, optimum_bandwidth).
// Only the numbers are used.
const LAME_LOWPASS: readonly (readonly [kbps: number, hz: number])[] = [
  [64, 11000],
  [80, 13500],
  [96, 15100],
  [112, 15600],
  [128, 17000],
  [160, 17500],
  [192, 18600],
  [224, 19400],
  [256, 19700],
  [320, 20500],
];

// The table gives the top of LAME's transition band, which is 533 Hz wide at 44.1 kHz; the
// 6 dB point that findCutoff reports sits about this far below it.
const LAME_EDGE_OFFSET = 450;

function bitrateFor(hz: number): number {
  let best = LAME_LOWPASS[0]!;
  for (const row of LAME_LOWPASS) {
    if (Math.abs(row[1] - LAME_EDGE_OFFSET - hz) < Math.abs(best[1] - LAME_EDGE_OFFSET - hz))
      best = row;
  }
  return best[0];
}

function lowpassFor(kbps: number): number {
  let best = LAME_LOWPASS[0]!;
  for (const row of LAME_LOWPASS)
    if (Math.abs(row[0] - kbps) < Math.abs(best[0] - kbps)) best = row;
  return best[1];
}

export interface PcmDigest {
  /** False when a sample is not a whole number at this bit depth, so the decode was not bit-exact. */
  exact: boolean;
  /** Bits that ever change: the stated depth minus the low bits that are zero in every sample. */
  effectiveBits: number;
  /** MD5 of the samples packed the way FLAC does: interleaved, signed, little-endian. */
  md5: Uint8Array;
}

export function pcmDigest(channels: readonly Float32Array[], bits: number): PcmDigest {
  const scale = 2 ** (bits - 1);
  // Decoders differ in how they turn 16-bit integers into floats. Chromium divides negative
  // samples by 32768 and positive ones by 32767; others divide both by 32768. Whichever
  // convention makes every sample a whole number is the one that was used.
  return (
    digest(channels, bits, scale) ??
    digest(channels, bits, scale - 1) ?? {
      exact: false,
      effectiveBits: bits,
      md5: new Uint8Array(16),
    }
  );
}

function digest(
  channels: readonly Float32Array[],
  bits: number,
  positiveScale: number,
): PcmDigest | null {
  const scale = 2 ** (bits - 1);
  const bytes = Math.ceil(bits / 8);
  const nch = channels.length;
  const length = channels[0]?.length ?? 0;
  const hash = md5.create();
  const chunk = new Uint8Array(16384 * nch * bytes);
  let seen = 0;
  let o = 0;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < nch; c++) {
      const sample = channels[c]![i]!;
      const x = sample * (sample > 0 ? positiveScale : scale);
      const v = Math.round(x);
      // Float32 rounding leaves up to about 0.002 here; anything not decoded exactly is far off.
      if (Math.abs(x - v) > 0.01) return null;
      seen |= v;
      for (let b = 0; b < bytes; b++) chunk[o++] = v >> (8 * b);
    }
    if (o === chunk.length) {
      hash.update(chunk);
      o = 0;
    }
  }
  hash.update(chunk.subarray(0, o));
  const trailingZeros = seen === 0 ? bits : 31 - Math.clz32(seen & -seen);
  return { exact: true, effectiveBits: bits - trailingZeros, md5: hash.digest() };
}

export interface SampleStats {
  /** Highest absolute sample value; 1 is full scale. */
  peak: number;
  clippedSamples: number;
  clipRuns: number;
}

/**
 * Counts flat tops: three or more samples in a row sitting exactly on the file's highest or
 * lowest value. Only looked for when that value is within 1 dB of full scale.
 */
export function sampleStats(channels: readonly Float32Array[]): SampleStats {
  let hi = 0;
  let lo = 0;
  for (const data of channels) {
    for (let i = 0; i < data.length; i++) {
      const v = data[i]!;
      if (v > hi) hi = v;
      else if (v < lo) lo = v;
    }
  }
  const near = 10 ** (-1 / 20);
  let clippedSamples = 0;
  let clipRuns = 0;
  if (hi >= near || -lo >= near) {
    for (const data of channels) {
      let run = 0;
      let last = 0;
      for (let i = 0; i <= data.length; i++) {
        const v = data[i];
        const at = v === hi && hi >= near ? 1 : v === lo && -lo >= near ? -1 : 0;
        if (at !== 0 && at === last) {
          run++;
          continue;
        }
        if (run >= 3) {
          clippedSamples += run;
          clipRuns++;
        }
        run = at === 0 ? 0 : 1;
        last = at;
      }
    }
  }
  return { peak: Math.max(hi, -lo), clippedSamples, clipRuns };
}

export type Level = "ok" | "note" | "warn" | "bad";
export type Check = "source" | "resolution" | "loudness" | "integrity";

export interface Finding {
  check: Check;
  level: Level;
  text: string;
}

export interface Loudness {
  /** Integrated loudness, LUFS. */
  lufs: number;
  /** Loudness range, LU. */
  range: number;
  /** Maximum true peak, dBTP. */
  truePeak: number;
}

export interface Facts {
  /** Codec name for sentences, e.g. "MP3". */
  codec: string;
  lossless: boolean;
  /** Whether browsers of this kind decode the format at all. */
  supported: boolean;
  sampleRate: number;
  bits: number | null;
  kbps: number | null;
  /** Sample frames the header promises. */
  expectedFrames: number | null;
  /** Sample frames that actually decoded; null when decoding failed. */
  decodedFrames: number | null;
  cutoff: Cutoff | null;
  /** Null when the depth is unknown or the decode was not bit-exact. */
  effectiveBits: number | null;
  /**
   * Decoded audio against the checksum in the file. "unchecked" when the file has one but
   * this browser's decoder is not bit-exact; null when the file stores none.
   */
  checksum: "match" | "mismatch" | "unchecked" | null;
  stats: SampleStats | null;
  loudness: Loudness | null;
}

const kHz = (hz: number) => `${(hz / 1000).toFixed(1)} kHz`;

export function clock(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Lossless audio at CD rate normally reaches this far; an edge above it is the usual anti-alias filter.
const FULL_BAND_HZ = 21000;
// Below this, the edge is where MP3 up to about 224 kbps cuts. Between the two, a 256-320 kbps
// encode and a mastering filter look the same.
const SUSPICIOUS_HZ = 19500;
const SOURCE_RATES = [44100, 48000, 88200, 96000];

export function judge(f: Facts): Finding[] {
  const out: Finding[] = [];
  const add = (check: Check, level: Level, text: string) => out.push({ check, level, text });

  if (f.decodedFrames === null) {
    if (f.supported) add("integrity", "bad", "Could not be decoded. The file is probably damaged.");
    else
      add(
        "integrity",
        "note",
        "This browser cannot decode this format, so only the header was read.",
      );
    return out;
  }

  const tolerance = f.lossless
    ? f.sampleRate * 0.05
    : Math.max(f.sampleRate * 0.5, (f.expectedFrames ?? 0) * 0.01);
  const missing =
    f.expectedFrames !== null && f.decodedFrames < f.expectedFrames - tolerance
      ? f.expectedFrames - f.decodedFrames
      : 0;
  if (f.expectedFrames !== null && missing >= f.sampleRate) {
    add(
      "integrity",
      "bad",
      `Cut short: the header promises ${clock(f.expectedFrames / f.sampleRate)} but only ${clock(f.decodedFrames / f.sampleRate)} of audio is there.`,
    );
  } else if (f.checksum === "mismatch") {
    add(
      "integrity",
      "bad",
      "The audio does not match the checksum stored in the file. The file is damaged.",
    );
  } else if (missing > 0) {
    add(
      "integrity",
      "bad",
      `Damaged: ${missing.toLocaleString("en")} samples the header promises are missing from the audio.`,
    );
  } else if (f.checksum === "match") {
    add("integrity", "ok", "The audio matches the checksum stored in the file.");
  } else if (f.checksum === "unchecked") {
    add(
      "integrity",
      "ok",
      "Decodes from start to end. The stored checksum could not be compared in this browser.",
    );
  } else {
    add(
      "integrity",
      "ok",
      "Decodes from start to end. The file stores no checksum to compare against.",
    );
  }

  const nyquist = f.sampleRate / 2;
  const scale = Math.min(nyquist, 22050) / 22050;
  const hz = f.cutoff?.hz ?? null;
  if (!f.lossless) {
    const what = f.kbps ? `${f.codec} at ${Math.round(f.kbps)} kbps` : f.codec;
    if (hz !== null && f.kbps && hz < lowpassFor(f.kbps) * scale - 2500) {
      add(
        "source",
        "warn",
        `Lossy file (${what}), but its content stops at ${kHz(hz)}, which is typical of about ${bitrateFor(hz)} kbps. It may have been re-encoded from a smaller file.`,
      );
    } else {
      add(
        "source",
        "ok",
        `Lossy file (${what}).${hz === null ? "" : ` Content stops at ${kHz(hz)}, normal for a lossy encoder.`}`,
      );
    }
  } else if (hz !== null && hz < SUSPICIOUS_HZ * scale) {
    add(
      "source",
      "warn",
      `Suspicious: sharp cutoff at ${kHz(hz)}, typical of MP3 around ${bitrateFor(hz)} kbps. Lossless audio normally reaches ${kHz(FULL_BAND_HZ * scale)} or more.`,
    );
  } else if (hz !== null && hz < FULL_BAND_HZ * scale) {
    add(
      "source",
      "note",
      `Possibly from a high-bitrate lossy file: sharp cutoff at ${kHz(hz)}. MP3 at 256 to 320 kbps cuts there, but so do some masters, so this alone proves nothing.`,
    );
  } else {
    add("source", "ok", "No sign of lossy encoding: no encoder cutoff below the top of the band.");
  }

  if (f.lossless && f.sampleRate >= 88200) {
    // Rates this file could have been upsampled from, and the one whose top is nearest the edge.
    const rates = SOURCE_RATES.filter((r) => r <= f.sampleRate / 1.8);
    const source =
      hz === null || hz > (Math.max(...rates) / 2) * 1.06
        ? undefined
        : rates.reduce((best, r) => (Math.abs(r / 2 - hz) < Math.abs(best / 2 - hz) ? r : best));
    if (source) {
      add(
        "resolution",
        "warn",
        `Upsampled: content stops at ${kHz(hz!)} in a ${f.sampleRate / 1000} kHz file, so it probably comes from a ${source / 1000} kHz source.`,
      );
    } else {
      add(
        "resolution",
        "ok",
        `Has content above the range of CD audio, as a ${f.sampleRate / 1000} kHz file should.`,
      );
    }
  }
  if (
    f.bits !== null &&
    f.effectiveBits !== null &&
    f.effectiveBits > 0 &&
    f.effectiveBits < f.bits
  ) {
    const unused = f.bits - f.effectiveBits;
    add(
      "resolution",
      f.bits > 16 && f.effectiveBits <= 16 ? "warn" : "note",
      `${f.bits}-bit file holding ${f.effectiveBits}-bit audio: the lowest ${unused} ${unused === 1 ? "bit is" : "bits are"} zero in every sample.`,
    );
  } else if (f.bits !== null && f.bits > 16 && f.effectiveBits === f.bits) {
    add("resolution", "ok", `Uses all ${f.bits} bits.`);
  }

  if (f.stats && f.stats.clipRuns >= 5) {
    add(
      "loudness",
      "warn",
      `Clipping: ${f.stats.clippedSamples.toLocaleString("en")} samples sit flat at the maximum, in ${f.stats.clipRuns.toLocaleString("en")} places.`,
    );
  }
  if (f.loudness && f.loudness.truePeak > 0.05) {
    add(
      "loudness",
      "note",
      `True peak is +${f.loudness.truePeak.toFixed(1)} dBTP: the waveform between samples goes past full scale and can distort on playback.`,
    );
  }
  return out;
}

const LABELS: Record<string, string> = {
  "source:warn": "Suspicious source",
  "source:note": "Possibly lossy",
  "resolution:warn": "Fake hi-res",
  "resolution:note": "Unused bits",
  "loudness:warn": "Clipping",
  "loudness:note": "Peaks over full scale",
  "integrity:bad": "Damaged",
  "integrity:note": "Not decoded",
};

/** Short name for a finding that is not "ok", for the verdict column. */
export const label = (f: Finding): string => LABELS[`${f.check}:${f.level}`] ?? "";

const ORDER: readonly Level[] = ["ok", "note", "warn", "bad"];

export function worst(findings: readonly Finding[]): Level {
  return findings.reduce<Level>(
    (w, f) => (ORDER.indexOf(f.level) > ORDER.indexOf(w) ? f.level : w),
    "ok",
  );
}
