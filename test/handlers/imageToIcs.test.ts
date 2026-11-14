import { expect, test } from "bun:test";
import {
  ROWS,
  WIDTH,
  buildIcs,
  cellLightness,
  parseDay,
  series,
  shadeLevels,
} from "../../src/handlers/imageToIcs.ts";

const sunday = parseDay("2026-11-15");

// cell lightness of a grey image whose value depends on x
function lightnessOf(width: number, height: number, value: (x: number) => number) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = value(i % width);
    rgba.set([v, v, v, 255], i * 4);
  }
  return cellLightness(rgba, width, height);
}

test("shadeLevels draws black as full blocks and white as blanks, at any image size", () => {
  for (const [width, height] of [
    [280, 190],
    [2, 1],
  ]) {
    const halves = lightnessOf(width, height, (x) => (x < width / 2 ? 0 : 255));
    const [levels] = shadeLevels([halves]);
    expect(levels.length).toBe(ROWS * WIDTH);
    for (let i = 0; i < levels.length; i++) {
      expect(levels[i]).toBe(i % WIDTH < WIDTH / 2 ? 4 : 0);
    }
  }
});

test("shadeLevels keeps flat frames their own brightness, alone or in a video", () => {
  const [black, white] = shadeLevels([
    lightnessOf(4, 4, () => 0),
    lightnessOf(4, 4, () => 255),
    lightnessOf(4, 4, (x) => x * 85),
  ]);
  expect(black.every((level) => level === 4)).toBe(true);
  expect(white.every((level) => level === 0)).toBe(true);
  const [alone] = shadeLevels([lightnessOf(4, 4, () => 255)]);
  expect(alone.every((level) => level === 0)).toBe(true);
});

test("series takes the rule covering the most days from the earliest day, then the shortest", () => {
  const weekday = 6; // 2026-11-15 is a Sunday, Monday being 0
  expect(series([0, 1, 2, 3, 4, 5, 6], weekday)).toEqual([
    { run: [0, 1, 2, 3, 4, 5, 6], rule: "FREQ=DAILY;COUNT=7" },
  ]);
  expect(series([0, 7, 14], weekday)).toEqual([{ run: [0, 7, 14], rule: "FREQ=WEEKLY;COUNT=3" }]);
  expect(series([0, 1, 7, 8], weekday)).toEqual([
    { run: [0, 1, 7, 8], rule: "FREQ=WEEKLY;BYDAY=SU,MO;COUNT=4" },
  ]);
  expect(series([0, 3, 6, 9, 10], weekday)).toEqual([
    { run: [0, 3, 6, 9], rule: "FREQ=DAILY;INTERVAL=3;COUNT=4" },
    { run: [10], rule: "" },
  ]);
});

test("buildIcs gives each pixel one event while its shade repeats", () => {
  const blank = new Int8Array(ROWS * WIDTH);
  for (const weeks of [1, 2]) {
    const ics = buildIcs(
      Array.from({ length: weeks }, () => blank),
      sunday,
      "test",
    );
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe((ROWS * WIDTH) / 7);
    expect(ics).toContain(
      `UID:test0\nDTSTART:20261115T000000\nDURATION:PT15M\nRRULE:FREQ=DAILY;COUNT=${weeks * 7}\n`,
    );
  }
});

test("parseDay accepts real dates only", () => {
  expect(sunday).toBe(Date.UTC(2026, 10, 15));
  expect(() => parseDay("2026-02-30")).toThrow();
  expect(() => parseDay("15/11/2026")).toThrow();
});
