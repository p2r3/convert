import { expect, test } from "bun:test";
import {
  IMAGE_TEXT_END_MARKER,
  IMAGE_TEXT_MARKER,
  INTENSITY_PALETTE,
  characterToIntensity,
  decodeImageText,
  encodeImageText,
  intensityToCharacter,
} from "../../src/handlers/imageTextCodec.ts";

test("image text preserves preview, dimensions, and one intensity character per pixel", () => {
  const source = Uint8Array.from([0, 32, 128, 200, 255, 17]);
  const preview = "ASCII preview\n._-+*#@\n";
  const text = encodeImageText({ width: 3, height: 2, pixels: source }, preview);
  const lines = text.split("\n");
  const markerIndex = lines.indexOf(IMAGE_TEXT_MARKER);
  const endMarkerIndex = lines.indexOf(IMAGE_TEXT_END_MARKER);
  const rows = lines.slice(markerIndex + 3, endMarkerIndex);

  expect(text.startsWith(preview)).toBe(true);
  expect(markerIndex).toBeGreaterThan(0);
  expect(endMarkerIndex).toBe(lines.length - 1);
  expect(lines.slice(markerIndex, markerIndex + 3)).toEqual([
    IMAGE_TEXT_MARKER,
    "width=3",
    "height=2",
  ]);
  expect(rows).toHaveLength(2);
  expect(rows.every(row => row.length === 3)).toBe(true);
  expect(rows.join("").split("").every(character => INTENSITY_PALETTE.includes(character))).toBe(true);

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

test("image text accepts editor line endings and leaves ordinary text untagged", () => {
  const text = encodeImageText({ width: 1, height: 1, pixels: Uint8Array.of(127) });

  expect(decodeImageText(text.replaceAll("\n", "\r\n"))).toBeTruthy();
  expect(decodeImageText("ordinary text\nwith multiple lines")).toBeNull();
  expect(decodeImageText(`notes before\n${IMAGE_TEXT_MARKER}\nthis is still ordinary text`)).toBeNull();
  expect(decodeImageText("CONVERT.TO.IT IMAGE TEXT V1\nwidth=1\nheight=1\n@")).toBeNull();
});

test("malformed tagged image text is rejected", () => {
  expect(() => decodeImageText(`${IMAGE_TEXT_MARKER}\nwidth=2\nheight=1\n@\n${IMAGE_TEXT_END_MARKER}`)).toThrow();
  expect(() => decodeImageText(`${IMAGE_TEXT_MARKER}\nwidth=2\nheight=1\n@x\n${IMAGE_TEXT_END_MARKER}`)).toThrow();
  expect(() => decodeImageText(`${IMAGE_TEXT_MARKER}\nwidth=9007199254740991\nheight=1\n@\n${IMAGE_TEXT_END_MARKER}`)).toThrow(/pixel row 1/);

  const valid = encodeImageText({ width: 1, height: 1, pixels: Uint8Array.of(0) });
  expect(() => decodeImageText(valid.replace(`\n${IMAGE_TEXT_END_MARKER}`, ""))).toThrow(/missing end marker/);
  expect(() => decodeImageText(`${valid}\ntrailing`)).toThrow(/unexpected content after end marker/);
});
