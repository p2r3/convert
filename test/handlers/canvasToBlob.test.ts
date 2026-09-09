import { expect, test } from "bun:test";
import {
  INTENSITY_PALETTE,
  characterToIntensity,
  decodeImageText,
  encodeImageText,
  fitImageTextDimensions,
  intensityToCharacter,
} from "../../src/handlers/canvasToBlob/imageTextCodec.ts";

test("image text dimensions are capped at 512px while preserving aspect ratio", () => {
  expect(fitImageTextDimensions(320, 240)).toEqual({ width: 320, height: 240 });
  expect(fitImageTextDimensions(4000, 3000)).toEqual({ width: 512, height: 384 });
  expect(fitImageTextDimensions(1200, 2400)).toEqual({ width: 256, height: 512 });
});

test("image text uses one palette character per source pixel", () => {
  const source = Uint8Array.from([0, 32, 128, 200, 255, 17]);
  const text = encodeImageText({ width: 3, height: 2, pixels: source });
  const lines = text.split("\n");

  expect(lines).toHaveLength(2);
  expect(lines.every(row => row.length === 3)).toBe(true);
  expect(lines.join("").split("").every(character => INTENSITY_PALETTE.includes(character))).toBe(true);

  const decoded = decodeImageText(text);
  expect(decoded).toBeTruthy();
  expect(decoded!.width).toBe(3);
  expect(decoded!.height).toBe(2);

  const expected = source.map(intensity => characterToIntensity(intensityToCharacter(intensity)));
  expect(Array.from(decoded!.pixels.filter((_, index) => index % 4 === 0))).toEqual(Array.from(expected));
  expect(Array.from(decoded!.pixels.filter((_, index) => index % 4 === 1))).toEqual(Array.from(expected));
  expect(Array.from(decoded!.pixels.filter((_, index) => index % 4 === 2))).toEqual(Array.from(expected));
  expect(Array.from(decoded!.pixels.filter((_, index) => index % 4 === 3))).toEqual(new Array(source.length).fill(255));
});

test("image text infers dimensions and accepts editor line endings", () => {
  const text = encodeImageText({ width: 2, height: 2, pixels: Uint8Array.from([0, 64, 128, 255]) });

  expect(decodeImageText(text.replaceAll("\n", "\r\n"))).toBeTruthy();
  expect(decodeImageText(`${text}\n`)).toBeTruthy();

  const decoded = decodeImageText(text);
  expect(decoded?.width).toBe(2);
  expect(decoded?.height).toBe(2);
});

test("non-image text falls back unless it is a rectangular palette grid", () => {
  expect(decodeImageText("")).toBeNull();
  expect(decodeImageText("ordinary text\nwith multiple lines")).toBeNull();
  expect(decodeImageText("@@\n@")).toBeNull();
  expect(decodeImageText("@@\n@x")).toBeNull();
  expect(decodeImageText("@@\n@@\n\n")).toBeNull();

  const asciiArt = decodeImageText("@.\n%@");
  expect(asciiArt?.width).toBe(2);
  expect(asciiArt?.height).toBe(2);
});

test("50x50 image text round trip preserves spatial resolution", () => {
  const source = Uint8Array.from({ length: 50 * 50 }, (_, index) => index % 256);
  const text = encodeImageText({ width: 50, height: 50, pixels: source });
  const rows = text.split("\n");
  const decoded = decodeImageText(text);

  expect(rows).toHaveLength(50);
  expect(rows.every(row => row.length === 50)).toBe(true);
  expect(decoded?.width).toBe(50);
  expect(decoded?.height).toBe(50);
  expect(decoded?.pixels.length).toBe(50 * 50 * 4);
});
