import { expect, test } from "bun:test";
import type { HandlerDefinition } from "../src/FormatHandler.js";
import Formats from "../src/Formats.js";
import type { HandlerName } from "../src/handlers/index.js";
import {
  altersContent,
  applicableSettings,
  compressorsFor,
  ffmpegAudioFilter,
  ffmpegCopyArgs,
  ffmpegScaleFilter,
  ffmpegSettingsArgs,
  ffmpegSpeedFilter,
  settingsFor,
} from "../src/ConversionSettings.js";

test("ffmpegSettingsArgs maps settings to flags and skips unset ones", () => {
  expect(ffmpegSettingsArgs({})).toEqual([]);
  expect(ffmpegSettingsArgs({ quality: 50 })).toEqual([]);
  expect(ffmpegSettingsArgs({ fps: 10, videoBitrate: 200, audioBitrate: 96 })).toEqual([
    "-r",
    "10",
    "-b:v",
    "200k",
    "-b:a",
    "96k",
  ]);
  expect(ffmpegSettingsArgs({ start: 1.5, end: 4, stripMetadata: true })).toEqual([
    "-ss",
    "1.5",
    "-to",
    "4",
    "-map_metadata",
    "-1",
  ]);
});

test("ffmpegScaleFilter only exists when a size is set, and never enlarges", () => {
  expect(ffmpegScaleFilter({})).toBeUndefined();
  expect(ffmpegScaleFilter({ maxSize: 640 })).toContain("min(iw,640)");
});

test("applicableSettings depends on the output category and losslessness", () => {
  expect(applicableSettings(Formats.JPEG.builder("jpeg").to())).toEqual([
    "quality",
    "maxSize",
    "stripMetadata",
    "watermark",
  ]);
  expect(applicableSettings(Formats.PNG.builder("png").lossless().to())).toEqual([
    "maxSize",
    "stripMetadata",
    "watermark",
    "colors",
  ]);
  expect(applicableSettings(Formats.GIF.builder("gif").to())).toEqual([
    "fps",
    "maxSize",
    "start",
    "end",
  ]);
  expect(applicableSettings(Formats.MP4.builder("mp4").to())).toEqual([
    "fps",
    "videoBitrate",
    "audioBitrate",
    "maxSize",
    "start",
    "end",
    "copyStreams",
    "stripMetadata",
    "speed",
  ]);
  expect(applicableSettings(Formats.MP3.builder("mp3").to())).toEqual([
    "audioBitrate",
    "start",
    "end",
    "copyStreams",
    "stripMetadata",
    "normalize",
    "fadeIn",
    "fadeOut",
    "mono",
    "reverse",
    "trimSilence",
    "speed",
  ]);
  expect(applicableSettings(Formats.JSON.builder("json").to())).toEqual([]);
  // tools whose handlers read none of them
  expect(applicableSettings({ ...Formats.MP4.builder("mp4").to(), format: "audio-video" })).toEqual(
    [],
  );
  expect(
    applicableSettings({ ...Formats.PNG.builder("png").to(), format: "contact-sheet" }),
  ).toEqual([]);
  for (const format of ["favicon", "collage", "framed", "halftone", "depth", "metadata"]) {
    expect(applicableSettings({ ...Formats.PNG.builder("png").to(), format })).toEqual([]);
  }
  // a vector image has no pixels to stamp
  expect(applicableSettings(Formats.SVG.builder("svg").to())).toEqual([]);
});

test("ffmpegSpeedFilter cuts the video as the audio chain does, then changes its pace", () => {
  expect(ffmpegSpeedFilter({})).toBeUndefined();
  expect(ffmpegSpeedFilter({ start: 2 })).toBeUndefined();
  expect(ffmpegSpeedFilter({ speed: 2 })).toBe("setpts=(PTS-STARTPTS)/2");
  expect(ffmpegSpeedFilter({ speed: 0.5, start: 1, end: 3 })).toBe(
    "trim=start=1:end=3,setpts=(PTS-STARTPTS)/0.5",
  );
  // the audio half of the same change
  expect(ffmpegAudioFilter({ speed: 2, start: 1 })).toBe(
    "atrim=start=1,asetpts=PTS-STARTPTS,atempo=2",
  );
});

const PDF = Formats.PDF.builder("pdf").fromTo();
const pdf = (format: string, input = PDF) => applicableSettings({ ...PDF, format }, input);

test("applicableSettings offers the PDF tools their own settings", () => {
  expect(pdf("pdf")).toEqual([
    "pages",
    "rotate",
    "quality",
    "password",
    "protect",
    "pageNumbers",
    "watermark",
  ]);
  expect(pdf("pdf-pages")).toEqual(["pages", "rotate", "password"]);
  // merging has a handler of its own, which reads no settings
  expect(pdf("pdf-merged")).toEqual([]);
  // a PDF made from something else comes from a tool that would silently ignore them
  expect(pdf("pdf", Formats.DOCX.builder("docx").from())).toEqual([]);
  expect(applicableSettings(PDF)).toEqual([]);
  expect(pdf("pdf-pages", Formats.DOCX.builder("docx").from())).toEqual([
    "pages",
    "rotate",
    "password",
  ]);
});

test("settingsFor keeps a page selection as text and a rotation in quarter turns", () => {
  expect(settingsFor({ pages: " 2-5,8 ", rotate: 180 }, PDF, {}, PDF)).toEqual({
    pages: "2-5,8",
    rotate: 180,
  });
  expect(settingsFor({ pages: "  " }, PDF, {}, PDF)).toEqual({});
  for (const rotate of [45, 360, -90]) expect(settingsFor({ rotate }, PDF, {}, PDF)).toEqual({});
});

test("settingsFor does not re-encode a PDF's images just because pages were turned or selected", () => {
  expect(settingsFor({}, PDF, { quality: 70 }, PDF)).toEqual({ quality: 70 });
  expect(settingsFor({ rotate: 90 }, PDF, { quality: 70 }, PDF)).toEqual({ rotate: 90 });
  expect(settingsFor({ pages: "1" }, PDF, { quality: 70 }, PDF)).toEqual({ pages: "1" });
  expect(settingsFor({ pages: "1", quality: 50 }, PDF, { quality: 70 }, PDF)).toEqual({
    pages: "1",
    quality: 50,
  });
});

test("ffmpegCopyArgs seeks the input and turns the end into a duration", () => {
  expect(ffmpegCopyArgs({})).toEqual({
    input: [],
    output: ["-c", "copy", "-avoid_negative_ts", "make_zero"],
  });
  expect(ffmpegCopyArgs({ start: 10, end: 25.5, stripMetadata: true })).toEqual({
    input: ["-ss", "10"],
    output: ["-t", "15.5", "-c", "copy", "-avoid_negative_ts", "make_zero", "-map_metadata", "-1"],
  });
  expect(ffmpegCopyArgs({ end: 8 }).output.slice(0, 2)).toEqual(["-t", "8"]);
  // what would force a re-encode is left out
  expect(ffmpegCopyArgs({ fps: 10, videoBitrate: 200, maxSize: 640 }).output).toEqual([
    "-c",
    "copy",
    "-avoid_negative_ts",
    "make_zero",
  ]);
});

test("settingsFor drops stale, invalid and out-of-range values", () => {
  const jpeg = Formats.JPEG.builder("jpeg").to();
  expect(settingsFor({ quality: 500, fps: 30 }, jpeg)).toEqual({ quality: 100 });
  expect(settingsFor({ quality: -5 }, jpeg)).toEqual({});
  expect(settingsFor({ quality: NaN }, jpeg)).toEqual({});
  expect(settingsFor({ stripMetadata: false }, jpeg)).toEqual({});
  expect(settingsFor({ stripMetadata: true }, jpeg)).toEqual({ stripMetadata: true });
});

test("settingsFor uses defaults only for keys the user left unset", () => {
  const jpeg = Formats.JPEG.builder("jpeg").to();
  expect(settingsFor({}, jpeg, { quality: 70 })).toEqual({ quality: 70 });
  expect(settingsFor({ quality: undefined }, jpeg, { quality: 70 })).toEqual({ quality: 70 });
  expect(settingsFor({ quality: 90 }, jpeg, { quality: 70 })).toEqual({ quality: 90 });
  // a default must not leak into a format it doesn't apply to
  expect(settingsFor({}, Formats.MP3.builder("mp3").to(), { quality: 70 })).toEqual({});
});

test("settingsFor drops an end that isn't after the start", () => {
  const mp4 = Formats.MP4.builder("mp4").to();
  expect(settingsFor({ start: 5, end: 3 }, mp4)).toEqual({ start: 5 });
  expect(settingsFor({ start: 5, end: 9 }, mp4)).toEqual({ start: 5, end: 9 });
});

test("altersContent separates edits from pure re-encoding", () => {
  expect(altersContent({ quality: 40, videoBitrate: 500 })).toBe(false);
  expect(altersContent({ maxSize: 800 })).toBe(true);
  expect(altersContent({ stripMetadata: true })).toBe(true);
  expect(altersContent({ copyStreams: true })).toBe(false);
  expect(altersContent({ pages: "1" })).toBe(true);
  expect(altersContent({ rotate: 90 })).toBe(true);
  // locking, stamping and audio edits make a file larger, and must not be swapped for the original
  expect(altersContent({ protect: "secret" })).toBe(true);
  expect(altersContent({ pageNumbers: true })).toBe(true);
  expect(altersContent({ fadeIn: 2 })).toBe(true);
  // fewer colours is lossy compression, like quality: a larger result gives way to the original
  expect(altersContent({ colors: 64 })).toBe(false);
});

const mp3 = Formats.MP3.builder("mp3").to();

test("settingsFor keeps audio edits in range and drops a stream copy they would undo", () => {
  expect(settingsFor({ speed: 10, normalize: true, copyStreams: true }, mp3)).toEqual({
    speed: 4,
    normalize: true,
  });
  expect(settingsFor({ speed: 0.1 }, mp3)).toEqual({ speed: 0.5 });
  // the normal speed is no edit at all
  expect(settingsFor({ speed: 1, copyStreams: true }, mp3)).toEqual({ copyStreams: true });
  // audio edits are for audio only, not a video's soundtrack
  expect(settingsFor({ fadeIn: 2 }, Formats.MP4.builder("mp4").to())).toEqual({});
});

test("settingsFor rounds a palette size into 2–256, for PNG only", () => {
  const png = Formats.PNG.builder("png").lossless().to();
  expect(settingsFor({ colors: 1000 }, png)).toEqual({ colors: 256 });
  expect(settingsFor({ colors: 63.6 }, png)).toEqual({ colors: 64 });
  expect(settingsFor({ colors: 64 }, Formats.JPEG.builder("jpeg").to())).toEqual({});
});

test("settingsFor rejects PDF passwords that would break mupdf's option string", () => {
  expect(settingsFor({ protect: " a b " }, PDF, {}, PDF)).toEqual({ protect: "a b" });
  expect(() => settingsFor({ protect: "a,b" }, PDF, {}, PDF)).toThrow("comma");
  expect(() => settingsFor({ password: "a=b" }, PDF, {}, PDF)).toThrow("equals");
  // protecting a PDF is no request to re-encode its images at the default quality
  expect(settingsFor({ protect: "x" }, PDF, { quality: 70 }, PDF)).toEqual({ protect: "x" });
});

test("ffmpegAudioFilter builds one chain, with the cut first and loudness last", () => {
  expect(ffmpegAudioFilter({ start: 2 })).toBeUndefined();
  expect(ffmpegAudioFilter({ start: 2, end: 9, fadeIn: 1, normalize: true })).toBe(
    "atrim=start=2:end=9,asetpts=PTS-STARTPTS,afade=t=in:d=1,loudnorm=I=-14:TP=-1",
  );
  // the end is only reachable reversed, and both end-of-file edits share one pair of reversals
  expect(ffmpegAudioFilter({ fadeOut: 3, trimSilence: true, mono: true })).toBe(
    "silenceremove=start_periods=1:start_threshold=-50dB,areverse," +
      "silenceremove=start_periods=1:start_threshold=-50dB,afade=t=in:d=3,areverse," +
      "aformat=channel_layouts=mono",
  );
  expect(ffmpegAudioFilter({ speed: 1.5, reverse: true })).toBe("atempo=1.5,areverse");
  // with the cut in the filter, it must not be applied a second time
  expect(ffmpegSettingsArgs({ start: 2, fadeIn: 1 })).toEqual([]);
  expect(ffmpegSettingsArgs({ start: 2 })).toEqual(["-ss", "2"]);
});

const handler = (name: string, ...formats: HandlerDefinition["supportedFormats"] & {}) =>
  ({ name: name as HandlerName, supportedFormats: formats }) satisfies HandlerDefinition;

test("compressorsFor only trusts listed handlers that read and write the format", () => {
  const handlers = [
    // reads and writes JPEG, but as a spectrogram
    handler("meyda", Formats.JPEG.builder("image").fromTo()),
    handler("canvasToBlob", Formats.JPEG.builder("jpeg").fromTo()),
    handler(
      "ImageMagick",
      Formats.JPEG.builder("jpeg").from(),
      Formats.JPEG.builder("jpg").to(),
      Formats.PNG.builder("png").fromTo(),
    ),
    handler("FFmpeg", Formats.MP4.builder("mp4").fromTo(), Formats.MP3.builder("mp3").to()),
    handler("mediabunny", Formats.MP4.builder("mp4").fromTo()),
    handler("pandoc", Formats.DOCX.builder("docx").fromTo()),
    handler("oxipng", Formats.PNG.builder("png").fromTo()),
    // reads and writes PNG, but is not a compressor
    handler("canvasToBlob", Formats.PNG.builder("png").fromTo()),
    handler("compressPdf", Formats.PDF.builder("pdf").fromTo()),
    handler("mupdf", Formats.PDF.builder("pdf").fromTo()),
  ];
  const names = (format: (typeof handlers)[number]["supportedFormats"][number]) =>
    compressorsFor(format, handlers).map(([, h]) => h.name as string);

  expect(names(Formats.JPEG.builder("x").nowhere())).toEqual(["ImageMagick", "canvasToBlob"]);
  expect(names(Formats.MP4.builder("x").nowhere())).toEqual(["mediabunny", "FFmpeg"]);
  expect(names(Formats.PNG.builder("x").nowhere())).toEqual(["oxipng"]);
  // fewer colours is lossy, which oxipng won't do
  const quantising = compressorsFor(Formats.PNG.builder("x").nowhere(), handlers, { colors: 64 });
  expect(quantising.map(([, h]) => h.name as string)).toEqual(["ImageMagick"]);
  // nor will it stamp a watermark
  const stamping = compressorsFor(Formats.PNG.builder("x").nowhere(), handlers, { watermark: "A" });
  expect(stamping.map(([, h]) => h.name as string)).toEqual(["ImageMagick"]);
  expect(names(Formats.PDF.builder("x").nowhere())).toEqual(["compressPdf"]);
  // mediabunny always re-encodes, so a stream copy leaves only FFmpeg
  const copying = compressorsFor(Formats.MP4.builder("x").nowhere(), handlers, {
    copyStreams: true,
  });
  expect(copying.map(([, h]) => h.name as string)).toEqual(["FFmpeg"]);
  // nor does mediabunny have audio filters
  const fading = compressorsFor(Formats.MP4.builder("x").nowhere(), handlers, { fadeIn: 1 });
  expect(fading.map(([, h]) => h.name as string)).toEqual(["FFmpeg"]);
  const faster = compressorsFor(Formats.MP4.builder("x").nowhere(), handlers, { speed: 2 });
  expect(faster.map(([, h]) => h.name as string)).toEqual(["FFmpeg"]);
  // FFmpeg can't read MP3 here, and DOCX isn't on the list at all
  expect(names(Formats.MP3.builder("x").nowhere())).toEqual([]);
  expect(names(Formats.DOCX.builder("x").nowhere())).toEqual([]);
});
