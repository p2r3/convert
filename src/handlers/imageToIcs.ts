import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { ConvertContext } from "../ui/ProgressStore.ts";

import Formats from "src/Formats.ts";
import { InitializationError } from "src/errors.ts";
import { changeExt, encode } from "src/common/index.ts";
import { filePath } from "src/common/path.ts";
import { createCanvas, type CanvasBundle } from "src/common/canvas.ts";

// Converts each image into one calendar week. Google + Outlook lay out overlapping
// events side by side in start-time order; columns are offset by 1 minute so they order correctly
// title used for shading
const COLS = 4;
const SPACING = 15; // minimum display size for an event
// events running past midnight regroup and squeeze the last rows into more columns
// which is obv wrong
export const ROWS = Math.floor((1440 - SPACING - (COLS - 1)) / SPACING) + 1;
export const WIDTH = 7 * COLS;

// We prioritize dark mode, so titles span lightness 6 to 57 against 57 to 100 in light mode.
// Each lightness (CIE L*) mixes the share of the title painted in dark text with the event
// colour, averaged over Google's 24 colours user can decide that
// title fits 30 full blocks, so a quarter-column title needs 8. The blank is braille blank
// because google kills spaces to do "(no title)" stuff
const SHADES = [
  { title: "⠀".repeat(9), lightness: 57.17 }, // THIS IS A BRAILLE BLANK DON'T REPLACE WITH SPACE
  { title: "░".repeat(8), lightness: 53.43 },
  { title: "▒".repeat(8), lightness: 49.23 },
  { title: "▓".repeat(8), lightness: 32.48 },
  { title: "█".repeat(8), lightness: 5.88 },
];

const LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

// the pixels [start, end) under grid cell i of n, at least one when upscaling
function span(i: number, n: number, pixels: number): [number, number] {
  const start = Math.floor((i * pixels) / n);
  return [start, Math.max(start + 1, Math.floor(((i + 1) * pixels) / n))];
}

export function cellLightness(rgba: Uint8ClampedArray, width: number, height: number) {
  // average each cell in linear light so it keeps its true brightness, then take L*, where
  // equal steps look equally different
  const lightness = new Float64Array(ROWS * WIDTH);
  for (let r = 0; r < ROWS; r++) {
    const [y0, y1] = span(r, ROWS, height);
    for (let c = 0; c < WIDTH; c++) {
      const [x0, x1] = span(c, WIDTH, width);
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = (y * width + x) * 4;
          sum +=
            0.2126 * LINEAR[rgba[p]] + 0.7152 * LINEAR[rgba[p + 1]] + 0.0722 * LINEAR[rgba[p + 2]];
        }
      }
      const lum = sum / ((y1 - y0) * (x1 - x0));
      lightness[r * WIDTH + c] = lum > 216 / 24389 ? 116 * Math.cbrt(lum) - 16 : (24389 / 27) * lum;
    }
  }

  return lightness;
}

export function shadeLevels(frames: Float64Array[]): Int8Array[] {
  // Stretch the images' range onto the shades' or else low-contrast images come out all one
  // shade; the percentiles and the midtone gamma were hyperparam tuned. Video uses one range
  // across all frames to avoid flicker
  // percentiles come from a 0.001 L* histogram, so a long video needs no sorted copy of every cell
  const counts = new Uint32Array(100_001);
  for (const frame of frames) for (const v of frame) counts[Math.round(v * 1000)]++;
  const percentile = (p: number) => {
    const rank = Math.round(p * (frames.length * ROWS * WIDTH - 1));
    let seen = 0;
    for (let bin = 0; bin < counts.length; bin++) {
      seen += counts[bin];
      if (seen > rank) return bin / 1000;
    }
    return 100;
  };
  let lo = percentile(0.025);
  let hi = percentile(0.955);
  if (hi - lo < 1) [lo, hi] = [0, 100]; // nothing to stretch
  const dark = SHADES[SHADES.length - 1].lightness;
  const light = SHADES[0].lightness;

  return frames.map((frame) => {
    const lightness = frame.map((v) => {
      const t = ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) ** 1.3;
      return dark + t * (light - dark);
    });

    // Floyd-Steinberg dithering (i used flat before but banding problems bleh)
    const levels = new Int8Array(lightness.length);
    for (let i = 0; i < lightness.length; i++) {
      const c = i % WIDTH;
      const v = lightness[i];
      let k = 0;
      for (let j = 1; j < SHADES.length; j++) {
        if (Math.abs(SHADES[j].lightness - v) < Math.abs(SHADES[k].lightness - v)) k = j;
      }
      levels[i] = k;
      const e = v - SHADES[k].lightness;
      if (c + 1 < WIDTH) lightness[i + 1] += (e * 7) / 16;
      if (i + WIDTH < lightness.length) {
        if (c > 0) lightness[i + WIDTH - 1] += (e * 3) / 16;
        lightness[i + WIDTH] += (e * 5) / 16;
        if (c + 1 < WIDTH) lightness[i + WIDTH + 1] += e / 16;
      }
    }
    return levels;
  });
}

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

// COUNT ends a repeating event on the last day it covers, so it never runs past the last image.
// With several images, an event can repeat across their weeks; that is on purpose.
function rule(run: number[], firstWeekday: number, weekly: boolean): string {
  if (run.length === 1) return "";
  if (weekly && new Set(run.map((d) => d % 7)).size > 1) {
    const days = new Set(run.map((d) => WEEKDAYS[(firstWeekday + d) % 7]));
    return `FREQ=WEEKLY;BYDAY=${[...days].join(",")};COUNT=${run.length}`;
  }
  const step = run[1] - run[0];
  if (step === 7) return `FREQ=WEEKLY;COUNT=${run.length}`;
  if (step === 1) return `FREQ=DAILY;COUNT=${run.length}`;
  return `FREQ=DAILY;INTERVAL=${step};COUNT=${run.length}`;
}

// groups duplicate shades at same time into repeating events, since fewer
// events make a smaller file +  imports faster.
// either daily every few days, or weekly on the weekdays of its
// first seven days, with ties going to the shorter rule.
// days must be ascending with no repeats; the loop order, `last` and the early break rely on it
export function series(days: number[], firstWeekday: number) {
  const left = new Set(days);
  const last = days[days.length - 1];
  const out: { run: number[]; rule: string }[] = [];
  for (const first of days) {
    if (!left.has(first)) continue;
    let best = { run: [first], rule: "" };
    const consider = (run: number[], weekly: boolean) => {
      if (run.length < best.run.length) return;
      const text = rule(run, firstWeekday, weekly);
      if (run.length > best.run.length || text.length < best.rule.length) {
        best = { run, rule: text };
      }
    };

    for (const next of left) {
      if (next === first) continue;
      const step = next - first;
      if (Math.floor((last - first) / step) + 1 < best.run.length) break; // larger steps fit fewer
      let n = 2;
      while (left.has(first + n * step)) n++;
      if (n < best.run.length) continue; // only runs that can win get an array
      consider(
        Array.from({ length: n }, (_, i) => first + i * step),
        false,
      );
    }

    const pattern = new Set<number>();
    for (let d = first; d < first + 7; d++) if (left.has(d)) pattern.add(d % 7);
    const weekly: number[] = [];
    for (let d = first; !pattern.has(d % 7) || left.has(d); d++) {
      if (pattern.has(d % 7)) weekly.push(d);
    }
    consider(weekly, true);

    out.push(best);
    for (const d of best.run) left.delete(d);
  }
  return out;
}

export function buildIcs(
  weeks: Int8Array[],
  firstDay: number,
  id: string,
  onProgress?: (done: number) => void,
): string {
  // all the weeks go in one file so repeats can run across them and you don't need to import
  // a badillion files
  const groups = new Map<number, number[]>();
  weeks.forEach((levels, week) => {
    for (let i = 0; i < levels.length; i++) {
      const r = Math.floor(i / WIDTH);
      const c = i % WIDTH;
      const key = (r * COLS + (c % COLS)) * SHADES.length + levels[i];
      const days = groups.get(key) ?? [];
      days.push(week * 7 + Math.floor(c / COLS));
      groups.set(key, days);
    }
  });

  const firstWeekday = (new Date(firstDay).getUTCDay() + 6) % 7;
  const events: { start: number; shade: number; rule: string }[] = [];
  let done = 0;
  for (const [key, days] of groups) {
    const shade = key % SHADES.length;
    const pixel = (key - shade) / SHADES.length;
    const minute = Math.floor(pixel / COLS) * SPACING + (pixel % COLS);
    for (const { run, rule } of series(days, firstWeekday)) {
      events.push({ start: run[0] * 1440 + minute, shade, rule });
    }
    if (++done % 64 === 0) onProgress?.(done / groups.size);
  }
  events.sort((a, b) => a.start - b.start);

  // Want to minimze the file size
  // Floating times are shorter than UTC and never split on daylight savings; DURATION smaller
  // than DTEND; and Google + Outlook import the file without DTSTAMP, TRANSP or CRLF so we can
  // kill those (even though RFC 5545 will get mad at me for this)
  const body = events.map(({ start, shade, rule }, i) => {
    const time = new Date(firstDay + start * 60_000).toISOString().slice(0, 19);
    return [
      "BEGIN:VEVENT",
      `UID:${id}${i.toString(36)}`,
      `DTSTART:${time.replace(/[-:]/g, "")}`,
      `DURATION:PT${SPACING}M`,
      ...(rule ? [`RRULE:${rule}`] : []),
      `SUMMARY:${SHADES[shade].title}`,
      "END:VEVENT\n",
    ].join("\n");
  });
  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//convert//imageToIcs//EN\n${body.join("")}END:VCALENDAR\n`;
}

export function parseDay(text: string): number {
  const day = Date.parse(`${text}T00:00:00Z`);
  if (Number.isNaN(day) || new Date(day).toISOString().slice(0, 10) !== text) {
    throw new RangeError(`"${text}" is not a date in the form YYYY-MM-DD.`);
  }
  return day;
}

const collator = new Intl.Collator("en", { numeric: true });

class imageToIcsHandler implements FormatHandler {
  public readonly name = "imageToIcs";
  public supportedFormats = [
    Formats.PNG.builder("png").from(),
    Formats.ICS.builder("ics")
      .options({
        start: {
          type: "string",
          label: "First day (YYYY-MM-DD)",
          category: "other",
          // real dates only, so the field flags 2026-02-30 instead of the conversion failing
          pattern:
            "\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|02-(?:0[1-9]|1\\d|2[0-8]))" +
            "|(?:\\d\\d(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]|[13579][26])00)-02-29",
        },
      })
      .to(),
  ];
  public ready = false;

  #bundle?: CanvasBundle;

  async init() {
    this.#bundle = createCanvas();
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    if (!this.#bundle) {
      throw new InitializationError("Handler not initialized.");
    }
    const { canvas, ctx: context } = this.#bundle;

    // name order, so video frames go in the right order from waterfalling
    const frames = inputFiles.toSorted((a, b) => collator.compare(filePath(a), filePath(b)));
    const lightness: Float64Array[] = [];
    for (const [i, file] of frames.entries()) {
      ctx?.throwIfAborted();
      ctx?.progress(`Reading image ${i + 1} of ${frames.length}...`, i / frames.length / 2);
      const blob = new Blob([file.bytes as BlobPart], { type: inputFormat.mime });
      const image = await createImageBitmap(blob, { colorSpaceConversion: "none" });
      canvas.width = image.width;
      canvas.height = image.height;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      image.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      lightness.push(cellLightness(pixels.data, canvas.width, canvas.height));
    }
    const weeks = shadeLevels(lightness);

    // weeks start on Sunday like the week view, unless the user picks a different day
    const now = new Date();
    const start = ctx?.options.start;
    const firstDay =
      typeof start === "string"
        ? parseDay(start)
        : Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    // UIDs only need to be unique by RFC 5545, so they are ms since 2026 in base 36 (8 characters
    // until 2115) plus the event's index, instead of the usual 40-byte ones
    const id = (Date.now() - Date.UTC(2026, 0, 1)).toString(36).padStart(8, "0");
    // not abortable: building runs synchronously, so cancelling has to stop the worker
    const progress = (done: number) => ctx?.progress("Building calendar...", 0.5 + done / 2);
    const bytes = encode(buildIcs(weeks, firstDay, id, progress));
    // Google restricts to 1 MB per import; outlook is probably 10 MB. there are like services out
    // there that let you split ics files into many smaller ones too so people can use that
    for (const [app, megabytes] of [
      ["Google Calendar", 1],
      ["Outlook", 10],
    ] as const) {
      if (bytes.length > megabytes * 1_000_000) {
        const warning = `The calendar is ${bytes.length} bytes, over ${app}'s ${megabytes} MB import limit.`;
        ctx?.log(warning, "warn");
      }
    }

    const suffix = frames.length > 1 ? `-${frames.length}-weeks` : "";
    return [{ name: changeExt(frames[0].name, outputFormat.extension, suffix), bytes }];
  }
}

export default imageToIcsHandler;
