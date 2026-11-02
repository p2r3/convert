import { expect, test } from "bun:test";
import { asciiHtml, faviconFiles, writeIco } from "../../src/handlers/imageTools.ts";
import { halftone, PAPER } from "../../src/handlers/halftone/engine.ts";

const png = (size: number) => new Uint8Array(size).fill(size % 256);

test("writeIco points every entry at its PNG, with 256 written as 0", () => {
  const ico = writeIco([
    { size: 16, png: png(10) },
    { size: 256, png: png(20) },
  ]);
  const view = new DataView(ico.buffer);

  expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([
    0, 1, 2,
  ]);
  expect([ico[6], ico[7], ico[22], ico[23]]).toEqual([16, 16, 0, 0]);
  // header and two entries, then the PNGs one after the other
  expect(view.getUint32(6 + 8, true)).toBe(10);
  expect(view.getUint32(6 + 12, true)).toBe(38);
  expect(view.getUint32(22 + 12, true)).toBe(48);
  expect(ico.length).toBe(68);
  expect(ico[48]).toBe(20);
});

test("faviconFiles gives the icons, a manifest and the tags that use them", async () => {
  const files = await faviconFiles(async (size) => png(size), "My site");

  expect(Object.keys(files).toSorted()).toEqual([
    "android-chrome-192x192.png",
    "android-chrome-512x512.png",
    "apple-touch-icon.png",
    "favicon-16x16.png",
    "favicon-32x32.png",
    "favicon.html",
    "favicon.ico",
    "site.webmanifest",
  ]);
  expect((files["apple-touch-icon.png"] as Uint8Array).length).toBe(180);
  expect(JSON.parse(files["site.webmanifest"] as string).name).toBe("My site");
  expect(files["favicon.html"]).toContain('href="/site.webmanifest"');
});

test("halftone leaves white paper bare and covers black in ink", () => {
  const size = 40;
  const pixels = (value: number) => ({
    data: new Uint8ClampedArray(size * size * 4).fill(value),
    width: size,
    height: size,
  });
  const paper = [0xf1, 0xe8, 0xd6, 255];

  const white = halftone(pixels(255), 4);
  expect(Array.from(white.slice(0, 4))).toEqual(paper);
  expect(white.every((v, i) => v === paper[i % 4])).toBe(true);

  const black = halftone(pixels(0), 4);
  let inked = 0;
  for (let i = 0; i < black.length; i += 4) if (black[i] < 0xf1) inked++;
  expect(inked / (size * size)).toBeGreaterThan(0.7);
  expect(PAPER).toBe("#f1e8d6");
});

test("asciiHtml writes a line per row of cells, in the colours of the picture", () => {
  // 40 × 30, red on the left and blue on the right
  const width = 40;
  const height = 30;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const left = p % width < width / 2;
    data.set(left ? [255, 0, 0, 255] : [0, 0, 255, 255], p * 4);
  }
  const html = asciiHtml({ data, width, height }, 10);
  const pre = /<pre[^>]*>\n([\s\S]*)<\/pre>/.exec(html)![1];

  // cells of 4 × 6 pixels: 10 across, 5 down
  expect(pre.split("\n").length - 1).toBe(5);
  expect(html).toContain('<span style="color:#f00">');
  expect(html).toContain('<span style="color:#00f">');
});
