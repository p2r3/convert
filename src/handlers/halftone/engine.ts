/*
 * Silk screen halftone, ported to TypeScript from silk-screen-halftone by ToolKnit:
 * https://github.com/ZihangDong/silk-screen-halftone
 *
 * MIT License
 *
 * Copyright (c) 2026 ToolKnit
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the 'Software'), to deal in the Software without
 * restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Changes: typed, the screens are masks of one byte per pixel instead of ImageData, and the cell
 * size is passed in instead of derived from a fixed LPI, so that dots grow with the picture.
 */

export interface Pixels {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export type Channel = "red" | "blue" | "grey";

/** One ink: which channel of the picture it prints, its screen angle and its colour. */
export interface Ink {
  channel: Channel;
  angle: number;
  color: string;
}

/** The demo's defaults: three inks on newsprint. */
export const INKS: Ink[] = [
  { channel: "red", angle: 15, color: "#e63946" },
  { channel: "blue", angle: 75, color: "#457b9d" },
  { channel: "grey", angle: 45, color: "#1d1d1d" },
];
export const PAPER = "#f1e8d6";

function hexToRgb(hex: string): [number, number, number] {
  const x = hex.replace("#", "");
  return [
    parseInt(x.substring(0, 2), 16),
    parseInt(x.substring(2, 4), 16),
    parseInt(x.substring(4, 6), 16),
  ];
}

/**
 * Lays a rotated grid of dots over the picture, each as large as the channel is dark under its
 * centre.
 * @returns A mask with 1 where the ink goes.
 */
export function screen(
  src: Pixels,
  channel: Channel,
  angle: number,
  cellSize: number,
  dotScale = 1,
): Uint8Array {
  const { width: w, height: h, data: sd } = src;
  const cs = Math.max(2, cellSize);
  const mx = (cs / 2) * dotScale;
  const out = new Uint8Array(w * h);
  const rad = (angle * Math.PI) / 180;
  const ca = Math.cos(rad);
  const sa = Math.sin(rad);
  const gc = Math.ceil(Math.ceil(Math.sqrt(w * w + h * h)) / cs) + 2;
  const ox = w / 2;
  const oy = h / 2;
  for (let gy = -gc; gy < gc; gy++) {
    for (let gx = -gc; gx < gc; gx++) {
      const cx = ca * gx * cs - sa * gy * cs + ox;
      const cy = sa * gx * cs + ca * gy * cs + oy;
      const sx = Math.floor(cx);
      const sy = Math.floor(cy);
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
      const idx = (sy * w + sx) * 4;
      const val =
        channel === "red"
          ? sd[idx]
          : channel === "blue"
            ? sd[idx + 2]
            : 0.299 * sd[idx] + 0.587 * sd[idx + 1] + 0.114 * sd[idx + 2];
      const dr = mx * (1 - val / 255);
      if (dr < 0.3) continue;
      const r2 = dr * dr;
      const x0 = Math.max(0, Math.floor(cx - dr));
      const y0 = Math.max(0, Math.floor(cy - dr));
      const x1 = Math.min(w - 1, Math.ceil(cx + dr));
      const y1 = Math.min(h - 1, Math.ceil(cy + dr));
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          if ((px - cx) * (px - cx) + (py - cy) * (py - cy) <= r2) out[py * w + px] = 1;
        }
      }
    }
  }
  return out;
}

/** Prints the inks on paper, each multiplying what is under it, like ink on newsprint. */
export function halftone(
  src: Pixels,
  cellSize: number,
  inks: Ink[] = INKS,
  paper = PAPER,
): Uint8ClampedArray {
  const masks = inks.map((ink) => screen(src, ink.channel, ink.angle, cellSize));
  const colors = inks.map((ink) => hexToRgb(ink.color));
  const [pr, pg, pb] = hexToRgb(paper);
  const out = new Uint8ClampedArray(src.width * src.height * 4);
  for (let p = 0; p < src.width * src.height; p++) {
    let r = pr;
    let g = pg;
    let b = pb;
    for (let i = 0; i < masks.length; i++) {
      if (!masks[i][p]) continue;
      r = Math.round((r * colors[i][0]) / 255);
      g = Math.round((g * colors[i][1]) / 255);
      b = Math.round((b * colors[i][2]) / 255);
    }
    out[p * 4] = r;
    out[p * 4 + 1] = g;
    out[p * 4 + 2] = b;
    out[p * 4 + 3] = 255;
  }
  return out;
}
