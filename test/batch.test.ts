import { expect, test } from "bun:test";
import type { FileFormat, HandlerDefinition } from "../src/FormatHandler.js";
import Formats from "../src/Formats.js";
import type { HandlerName } from "../src/handlers/index.js";
import {
  groupByTarget,
  keepSmaller,
  resolveTargets,
  siblingKeys,
  toolsFor,
  uniqueNames,
} from "../src/batch.js";

const option = (format: FileFormat, handler: string): [FileFormat, HandlerDefinition] => [
  format,
  { name: handler as HandlerName },
];
const file = (name: string, size: number) => ({ name, bytes: new Uint8Array(size) });

test("groupByTarget keeps files with the same input and output together, in order", () => {
  const png = option(Formats.PNG.builder("png").from(), "a");
  const jpeg = option(Formats.JPEG.builder("jpeg").from(), "a");
  const webp = option(Formats.WEBP.builder("webp").to(), "a");
  const pdf = option(Formats.PDF.builder("pdf").to(), "b");

  const groups = groupByTarget([
    { id: 1, from: png, to: webp },
    { id: 2, from: jpeg, to: webp },
    { id: 3, from: png, to: pdf },
    { id: 4, from: png, to: webp },
  ]);

  expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([[1, 4], [2], [3]]);
});

test("groupByTarget separates the same format reached through different handlers", () => {
  const png = option(Formats.PNG.builder("png").from(), "a");
  const groups = groupByTarget([
    { from: png, to: option(Formats.WEBP.builder("webp").to(), "a") },
    { from: png, to: option(Formats.WEBP.builder("webp").to(), "b") },
  ]);
  expect(groups.length).toBe(2);
});

test("uniqueNames numbers repeats before the extension and never collides", () => {
  expect(uniqueNames(["a.png", "b.png"])).toEqual(["a.png", "b.png"]);
  expect(uniqueNames(["a.png", "a.png", "a.png"])).toEqual(["a.png", "a (2).png", "a (3).png"]);
  expect(uniqueNames(["a.png", "a (2).png", "a.png"])).toEqual(["a.png", "a (2).png", "a (3).png"]);
  expect(uniqueNames(["README", "README"])).toEqual(["README", "README (2)"]);
});

test("keepSmaller returns the input wherever the output didn't shrink", () => {
  const inputs = [file("a.jpg", 100), file("b.jpg", 100), file("c.jpg", 100)];
  const outputs = [file("a.jpg", 40), file("b.jpg", 100), file("c.jpg", 150)];
  expect(keepSmaller(inputs, outputs)).toEqual([outputs[0], inputs[1], inputs[2]]);
});

test("keepSmaller leaves outputs alone when they don't pair up with the inputs", () => {
  const outputs = [file("merged.pdf", 500)];
  expect(keepSmaller([file("a.pdf", 10), file("b.pdf", 10)], outputs)).toBe(outputs);
});

const pick = (name: string, type = "") => new File([], name, { type });
const pngIn = option(Formats.PNG.builder("png").from(), "a");
const jpegIn = option(Formats.JPEG.builder("jpeg").from(), "a");
const webpOut = option(Formats.WEBP.builder("webp").to(), "a");
const pdfOut = option(Formats.PDF.builder("pdf").to(), "b");
const options = new Map([pngIn, jpegIn, webpOut, pdfOut]);

test("resolveTargets detects the input format and leaves the output open", () => {
  const targets = resolveTargets(options, [["one", pick("one.png", "image/png")]], {}, true);

  expect(targets.one.from).toEqual(pngIn);
  expect(targets.one.to).toBeNull();
});

test("resolveTargets reads .mmd as a Mermaid diagram, not as MultiMarkdown", () => {
  const mermaidIn = option(Formats.MERMAID.builder("mermaid").from(), "mermaid");
  const multiMarkdown = option(
    { ...Formats.MD.builder("markdown_mmd").from(), format: "markdown_mmd", extension: "md" },
    "pandoc",
  );
  const targets = resolveTargets(
    new Map([multiMarkdown, mermaidIn]),
    [["one", pick("flow.mmd")]],
    {},
    true,
  );

  expect(targets.one.from).toEqual(mermaidIn);
});

test("resolveTargets gives a new file the output already chosen for its format", () => {
  const files: [string, File][] = [
    ["one", pick("one.png", "image/png")],
    ["two", pick("two.png", "image/png")],
    ["three", pick("three.jpg", "image/jpeg")],
  ];
  const targets = resolveTargets(options, files, { one: { from: pngIn, to: pdfOut } }, true);

  expect(targets.two).toEqual({ from: pngIn, to: pdfOut });
  expect(targets.three).toEqual({ from: jpegIn, to: null });
});

test("resolveTargets keeps what the user chose, and guesses nothing for an unknown file", () => {
  const files: [string, File][] = [
    ["one", pick("one.png", "image/png")],
    ["odd", pick("odd.xyz")],
  ];
  const stored = { one: { from: jpegIn, to: webpOut } };
  const targets = resolveTargets(options, files, stored, true);

  expect(targets.one).toBe(stored.one);
  expect(targets.odd).toEqual({ from: null, to: null });
});

test("resolveTargets only auto-picks in advanced mode when one handler reads the format", () => {
  const otherPng = option(Formats.PNG.builder("png").from(), "b");
  const twoHandlers = new Map([pngIn, otherPng]);
  const files: [string, File][] = [["one", pick("one.png", "image/png")]];

  expect(resolveTargets(twoHandlers, files, {}, false).one.from).toBeNull();
  expect(resolveTargets(twoHandlers, files, {}, true).one.from).toEqual(pngIn);
});

test("siblingKeys finds the files a choice also applies to", () => {
  const files: [string, File][] = [
    ["one", pick("one.png")],
    ["two", pick("two.png")],
    ["three", pick("three.jpg")],
    ["four", pick("four.png")],
  ];
  const targets = {
    one: { from: pngIn, to: null },
    two: { from: pngIn, to: null },
    three: { from: jpegIn, to: null },
    // same extension, but the user said it is really a JPEG
    four: { from: jpegIn, to: null },
  };

  expect(siblingKeys(files, targets, "one", "to")).toEqual(["two"]);
  expect(siblingKeys(files, targets, "one", "from")).toEqual(["two", "four"]);
  expect(siblingKeys(files, targets, "gone", "to")).toEqual([]);
});

test("toolsFor offers the tools that fit the input", () => {
  const png = Formats.PNG.builder("png").from();
  const pdf = Formats.PDF.builder("pdf").from();
  const mp4 = Formats.MP4.builder("mp4").from();
  const pictureTools = ["favicon", "framed", "halftone", "depth"];

  expect(toolsFor(png, 1, true)).toEqual([
    "ocr",
    "nobg",
    "upscaled-photo",
    "upscaled-drawing",
    ...pictureTools,
  ]);
  expect(toolsFor(pdf, 1, true)).toEqual(["ocr", "pdf-pages"]);
  expect(toolsFor(mp4, 1, true)).toEqual([
    "contact-sheet",
    "upscaled-film",
    "upscaled-animation",
    "metadata",
  ]);
  expect(toolsFor(Formats.MP3.builder("mp3").from(), 1, true)).toEqual([
    "audio-check",
    "audio-video",
    "metadata",
  ]);
  expect(toolsFor(png, 3, false)).toEqual([
    "ocr",
    "nobg",
    ...pictureTools,
    "collage",
    "pdf-from-images",
  ]);
  expect(toolsFor(Formats.JSON.builder("json").from(), 1, true)).toEqual(["ts"]);
});

test("toolsFor leaves out what cannot work: merging one PDF, upscaling without WebGPU", () => {
  expect(toolsFor(Formats.PDF.builder("pdf").from(), 2, true)).toContain("pdf-merged");
  expect(toolsFor(Formats.PNG.builder("png").from(), 1, false)).toEqual([
    "ocr",
    "nobg",
    "favicon",
    "framed",
    "halftone",
    "depth",
  ]);
  // a collage of one picture is that picture
  expect(toolsFor(Formats.PNG.builder("png").from(), 1, true)).not.toContain("collage");
  expect(toolsFor(Formats.MP4.builder("mp4").from(), 1, false)).toEqual([
    "contact-sheet",
    "metadata",
  ]);
  // the check judges the file as it is, which a MIDI file has to be converted for first
  expect(toolsFor(Formats.MIDI.builder("midi").from(), 1, true)).toEqual([
    "audio-video",
    "metadata",
  ]);
  // a vector image has no pixels to read or cut out, and a GIF counts as video
  expect(toolsFor(Formats.SVG.builder("svg").from(), 1, true)).toEqual([]);
  expect(toolsFor(Formats.GIF.builder("gif").from(), 1, false)).toEqual([]);
});
