import { expect, test } from "bun:test";
import {
  IMAGE_TEXT_MARKER,
  INTENSITY_PALETTE,
  characterToIntensity,
  decodeImageText,
  encodeImageText,
  intensityToCharacter,
} from "../../src/handlers/imageTextCodec.ts";

test("image text preserves dimensions and one intensity character per pixel", () => {
  const source = Uint8Array.from([0, 32, 128, 200, 255, 17]);
  const text = encodeImageText({ width: 3, height: 2, pixels: source });
  const lines = text.split("\n");
  const rows = lines.slice(3);

  expect(lines.slice(0, 3)).toEqual([
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
});

test("malformed tagged image text is rejected", () => {
  expect(() => decodeImageText(`${IMAGE_TEXT_MARKER}\nwidth=2\nheight=1\n@`)).toThrow();
  expect(() => decodeImageText(`${IMAGE_TEXT_MARKER}\nwidth=2\nheight=1\n@x`)).toThrow();
  expect(() => decodeImageText(`${IMAGE_TEXT_MARKER}\nwidth=9007199254740991\nheight=1\n@`)).toThrow(/pixel row 1/);
});
