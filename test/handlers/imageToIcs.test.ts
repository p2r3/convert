import { expect, test } from "bun:test";
import {
  ROWS,
  WIDTH,
  buildIcs,
  cellLightness,
  series,
  shadeLevels,
} from "../../src/handlers/imageToIcs.ts";

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

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

// the days an RRULE covers, read the way a calendar app would; days count from day 0, whose
// weekday is firstWeekday (Monday being 0)
function expand(first: number, rule: string, firstWeekday: number): number[] {
  if (!rule) return [first];
  const parts = Object.fromEntries(rule.split(";").map((part) => part.split("=")));
  const count = Number(parts.COUNT);
  const interval = Number(parts.INTERVAL ?? 1);
  if (parts.FREQ === "DAILY") return Array.from({ length: count }, (_, i) => first + i * interval);
  expect(parts.FREQ).toBe("WEEKLY");
  expect(interval).toBe(1); // week boundaries would matter otherwise
  const weekdayOf = (day: number) => WEEKDAYS[(firstWeekday + day) % 7];
  const byDay: string[] = parts.BYDAY?.split(",") ?? [weekdayOf(first)];
  expect(byDay).toContain(weekdayOf(first)); // apps disagree on a start outside its own rule
  const days: number[] = [];
  for (let day = first; days.length < count; day++) {
    if (byDay.includes(weekdayOf(day))) days.push(day);
  }
  return days;
}

test("series rules cover exactly the days given, each day once", () => {
  let seed = 1;
  const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const cases = [
    [0],
    [0, 1, 2, 3, 4, 5, 6],
    [0, 7, 14],
    [0, 1, 7, 8],
    [0, 3, 6, 9, 10],
    [2, 4, 9, 11, 16, 18, 20],
    ...Array.from({ length: 50 }, () => {
      const density = random();
      return Array.from({ length: 28 }, (_, day) => day).filter(() => random() < density);
    }).filter((days) => days.length > 0),
  ];
  for (const days of cases) {
    for (let firstWeekday = 0; firstWeekday < 7; firstWeekday++) {
      const result = series(days, firstWeekday);
      for (const { run, rule } of result) {
        expect(expand(run[0], rule, firstWeekday)).toEqual(run);
      }
      const covered = result.flatMap(({ run }) => run).toSorted((a, b) => a - b);
      expect(covered).toEqual(days);
    }
  }
  // the point of grouping: a shade held for the whole run is one event
  expect(series([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], 6).length).toBe(1);
});

test("buildIcs output draws every pixel of every week once, in its own shade", () => {
  const COLS = WIDTH / 7;
  const SPACING = 15;
  const TITLES = "⠀░▒▓█";
  const sunday = Date.UTC(2026, 10, 15);
  // three weeks that share some pixels and differ in others, so repeats cross weeks
  const weeks = Array.from({ length: 3 }, (_, week) =>
    Int8Array.from({ length: ROWS * WIDTH }, (_, i) => {
      const r = Math.floor(i / WIDTH);
      const c = i % WIDTH;
      return (r * 3 + c * 7 + (r % 4 === 0 ? week : 0) + (c % 5 === 0 ? week * 2 : 0)) % 5;
    }),
  );

  const ics = buildIcs(weeks, sunday, "test");
  expect(ics.startsWith("BEGIN:VCALENDAR\nVERSION:2.0\n")).toBe(true);
  expect(ics.endsWith("END:VEVENT\nEND:VCALENDAR\n")).toBe(true);

  const events = ics.split("BEGIN:VEVENT\n").slice(1);
  const drawn = weeks.map((levels) => new Int8Array(levels.length).fill(-1));
  const uids = new Set<string>();
  for (const event of events) {
    const field = (name: string) => event.match(new RegExp(`^${name}:(.*)$`, "m"))?.[1] ?? "";
    uids.add(field("UID"));
    expect(field("DURATION")).toBe(`PT${SPACING}M`);
    const [, y, mo, d, h, mi, s] = field("DTSTART").match(
      /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)$/,
    )!;
    expect(s).toBe("00");
    const firstDay = (Date.UTC(+y, +mo - 1, +d) - sunday) / 86_400_000;
    const minute = +h * 60 + +mi;
    const row = Math.floor(minute / SPACING);
    const sub = minute % SPACING;
    expect(row).toBeLessThan(ROWS);
    expect(sub).toBeLessThan(COLS);
    const title = field("SUMMARY");
    const shade = TITLES.indexOf(title[0]);
    expect(shade).toBeGreaterThanOrEqual(0);
    expect(new Set(title).size).toBe(1);

    for (const day of expand(firstDay, field("RRULE"), 6)) {
      const week = Math.floor(day / 7);
      const i = row * WIDTH + (day % 7) * COLS + sub;
      expect(day).toBeGreaterThanOrEqual(0);
      expect(week).toBeLessThan(weeks.length); // never runs past the last image
      expect(drawn[week][i]).toBe(-1); // no pixel drawn twice
      drawn[week][i] = shade;
    }
  }
  expect(uids.size).toBe(events.length);
  expect(drawn).toEqual(weeks);
  expect(events.length).toBeLessThan(ROWS * WIDTH * weeks.length); // repeats were grouped
});
