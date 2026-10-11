import { expect, test } from "bun:test";
import type { FileFormat, HandlerDefinition } from "../src/FormatHandler.js";
import Formats from "../src/Formats.js";
import type { HandlerName } from "../src/handlers/index.js";
import { groupByTarget, keepSmaller, uniqueNames } from "../src/batch.js";

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
