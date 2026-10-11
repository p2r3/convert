import { expect, test } from "bun:test";
import type { HandlerDefinition } from "../src/FormatHandler.js";
import Formats from "../src/Formats.js";
import type { HandlerName } from "../src/handlers/index.js";
import {
  altersContent,
  applicableSettings,
  compressorsFor,
  ffmpegScaleFilter,
  ffmpegSettingsArgs,
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
  ]);
  expect(applicableSettings(Formats.PNG.builder("png").lossless().to())).toEqual([
    "maxSize",
    "stripMetadata",
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
    "stripMetadata",
  ]);
  expect(applicableSettings(Formats.MP3.builder("mp3").to())).toEqual([
    "audioBitrate",
    "start",
    "end",
    "stripMetadata",
  ]);
  expect(applicableSettings(Formats.JSON.builder("json").to())).toEqual([]);
  expect(applicableSettings(Formats.SVG.builder("svg").to())).toEqual([]);
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
});

const handler = (name: string, ...formats: HandlerDefinition["supportedFormats"] & {}) =>
  ({ name: name as HandlerName, supportedFormats: formats }) satisfies HandlerDefinition;

test("compressorsFor only trusts listed handlers that read and write the format", () => {
  const handlers = [
    // reads and writes JPEG, but as a spectrogram
    handler("meyda", Formats.JPEG.builder("image").fromTo()),
    handler("canvasToBlob", Formats.JPEG.builder("jpeg").fromTo()),
    handler("ImageMagick", Formats.JPEG.builder("jpeg").from(), Formats.JPEG.builder("jpg").to()),
    handler("FFmpeg", Formats.MP4.builder("mp4").fromTo(), Formats.MP3.builder("mp3").to()),
    handler("pandoc", Formats.DOCX.builder("docx").fromTo()),
  ];
  const names = (format: (typeof handlers)[number]["supportedFormats"][number]) =>
    compressorsFor(format, handlers).map(([, h]) => h.name as string);

  expect(names(Formats.JPEG.builder("x").nowhere())).toEqual(["ImageMagick", "canvasToBlob"]);
  expect(names(Formats.MP4.builder("x").nowhere())).toEqual(["FFmpeg"]);
  // FFmpeg can't read MP3 here, and DOCX isn't on the list at all
  expect(names(Formats.MP3.builder("x").nowhere())).toEqual([]);
  expect(names(Formats.DOCX.builder("x").nowhere())).toEqual([]);
});
