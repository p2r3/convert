/*
 * SPDX-License-Identifier: MIT
 * Contains code adapted from UDOC.js (https://github.com/NineBitsLLC/UDOC.js)
 * and the supplied ToEMF writer, Copyright (c) 2018 Photopea.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { DOMParser } from "@xmldom/xmldom";
import { SVGPathData } from "svg-pathdata";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { changeExt, decode, encode } from "src/common/index.ts";
import Formats from "src/Formats.ts";
import * as emf from "emf-converter";

type Matrix = [number, number, number, number, number, number];
type XmlElement = NonNullable<ReturnType<DOMParser["parseFromString"]>["documentElement"]>;
type Color = [number, number, number];
type Paint = Color | null;
type SvgStyle = {
  fill: Paint;
  stroke: Paint;
  strokeWidth: number;
  fillRule: "evenodd" | "nonzero";
  display: string;
  visibility: string;
};
type Path = {
  cmds: ("M" | "L" | "C" | "Z")[];
  crds: number[];
};

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const EMR = {
  HEADER: 1,
  POLYBEZIERTO: 5,
  LINETO: 0x36,
  SETPOLYFILLMODE: 0x13,
  SELECTOBJECT: 0x25,
  CREATEPEN: 0x26,
  CREATEBRUSHINDIRECT: 0x27,
  BEGINPATH: 0x3b,
  ENDPATH: 0x3c,
  CLOSEFIGURE: 0x3d,
  FILLPATH: 0x3e,
  STROKEANDFILLPATH: 0x3f,
  STROKEPATH: 0x40,
  EOF: 0x0e,
} as const;

const NAMED_COLORS: Record<string, Color> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  maroon: [128, 0, 0],
  olive: [128, 128, 0],
  lime: [0, 255, 0],
  teal: [0, 128, 128],
  navy: [0, 0, 128],
  purple: [128, 0, 128],
  orange: [255, 165, 0],
};

// Matrix helpers adapted from UDOC.js (UDOC.M).
const UDOC = {
  M: {
    getScale(matrix: Matrix) {
      return Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]));
    },
    concat(matrix: Matrix, other: Matrix) {
      const [a, b, c, d, tx, ty] = matrix;
      matrix[0] = a * other[0] + b * other[2];
      matrix[1] = a * other[1] + b * other[3];
      matrix[2] = c * other[0] + d * other[2];
      matrix[3] = c * other[1] + d * other[3];
      matrix[4] = tx * other[0] + ty * other[2] + other[4];
      matrix[5] = tx * other[1] + ty * other[3] + other[5];
    },
  },
};

function svgLength(value: string | null, fallback: number, percentageBase?: number): number {
  if (value === null || value.trim() === "") return fallback;
  const percentage = value.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))%$/);
  if (percentage && percentageBase !== undefined) {
    return (Number(percentage[1]) * percentageBase) / 100;
  }
  const match = value
    .trim()
    .match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|pt|pc|mm|cm|in)?$/i);
  if (!match) throw new TypeError(`Unsupported SVG length: ${value}`);
  const amount = Number(match[1]);
  const unit = (match[2] ?? "px").toLowerCase();
  const factor =
    unit === "pt"
      ? 96 / 72
      : unit === "pc"
        ? 16
        : unit === "mm"
          ? 96 / 25.4
          : unit === "cm"
            ? 96 / 2.54
            : unit === "in"
              ? 96
              : 1;
  return amount * factor;
}

function parsePaint(value: string, property: string): Paint {
  const paint = value.trim().toLowerCase();
  if (paint === "none" || paint === "transparent") return null;
  if (paint.startsWith("url(") || paint === "currentcolor") {
    throw new TypeError(`SVG ${property} paint "${value}" is not supported.`);
  }
  if (paint in NAMED_COLORS) return [...NAMED_COLORS[paint]];

  const hex = paint.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      if (hex.length === 4 && Number.parseInt(hex[3] + hex[3], 16) !== 255) {
        throw new TypeError("SVG paint transparency is not supported.");
      }
      return [0, 1, 2].map((i) => Number.parseInt(hex[i] + hex[i], 16)) as Color;
    }
    if (hex.length === 6 || hex.length === 8) {
      if (hex.length === 8 && Number.parseInt(hex.slice(6, 8), 16) !== 255) {
        throw new TypeError("SVG paint transparency is not supported.");
      }
      return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Color;
    }
  }

  const rgb = paint.match(/^rgba?\((.+)\)$/);
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) {
      throw new TypeError(`Invalid SVG color: ${value}`);
    }
    if (parts.length === 4) {
      const alpha = parts[3].endsWith("%") ? Number.parseFloat(parts[3]) / 100 : Number(parts[3]);
      if (!Number.isFinite(alpha) || alpha < 1) {
        throw new TypeError("SVG paint transparency is not supported.");
      }
    }
    return parts.slice(0, 3).map((part) => {
      const percentage = part.endsWith("%");
      const channel = Number.parseFloat(part);
      if (!Number.isFinite(channel)) throw new TypeError(`Invalid SVG color: ${value}`);
      return Math.round(Math.max(0, Math.min(255, percentage ? channel * 2.55 : channel)));
    }) as Color;
  }
  throw new TypeError(`Unsupported SVG ${property} paint: ${value}`);
}

function elementStyle(element: XmlElement, inherited: SvgStyle): SvgStyle {
  const style: SvgStyle = { ...inherited };
  if (element.getAttribute("class")) {
    throw new TypeError("SVG CSS classes are not supported by EMF output.");
  }
  for (const property of ["clip-path", "mask", "filter"]) {
    const value = element.getAttribute(property);
    if (value && value !== "none") {
      throw new TypeError(`SVG ${property} is not supported by EMF output.`);
    }
  }
  const values: Record<string, string> = {};
  for (const property of [
    "fill",
    "stroke",
    "stroke-width",
    "fill-rule",
    "display",
    "visibility",
    "opacity",
    "fill-opacity",
    "stroke-opacity",
    "stroke-dasharray",
    "stroke-linecap",
    "stroke-linejoin",
    "vector-effect",
  ]) {
    const attribute = element.getAttribute(property);
    if (attribute !== null) values[property] = attribute;
  }
  const inlineStyle = element.getAttribute("style");
  if (inlineStyle) {
    for (const declaration of inlineStyle.split(";")) {
      const separator = declaration.indexOf(":");
      if (separator > 0) {
        values[declaration.slice(0, separator).trim()] = declaration.slice(separator + 1).trim();
      }
    }
  }
  if (values.display !== undefined) style.display = values.display;
  if (values.visibility !== undefined) style.visibility = values.visibility;
  if (values.fill !== undefined) style.fill = parsePaint(values.fill, "fill");
  if (values.stroke !== undefined) style.stroke = parsePaint(values.stroke, "stroke");
  if (values["stroke-width"] !== undefined) {
    style.strokeWidth = svgLength(values["stroke-width"], style.strokeWidth);
    if (style.strokeWidth < 0) throw new TypeError("SVG stroke width cannot be negative.");
  }
  if (values["fill-rule"] === "evenodd") style.fillRule = "evenodd";
  else if (values["fill-rule"] === "nonzero") style.fillRule = "nonzero";
  for (const property of ["opacity", "fill-opacity", "stroke-opacity"]) {
    if (
      values[property] !== undefined &&
      values[property] !== "inherit" &&
      Number(values[property]) !== 1
    ) {
      throw new TypeError(`SVG ${property} is not supported by EMF output.`);
    }
  }
  if (values["stroke-dasharray"] !== undefined && values["stroke-dasharray"].trim() !== "none") {
    throw new TypeError("Dashed SVG strokes are not supported by EMF output.");
  }
  const unsupportedStrokeStyles: Record<string, string> = {
    "stroke-linecap": "butt",
    "stroke-linejoin": "miter",
    "vector-effect": "none",
  };
  for (const [property, defaultValue] of Object.entries(unsupportedStrokeStyles)) {
    const value = values[property];
    if (value && value !== defaultValue) {
      throw new TypeError(`SVG ${property}="${value}" is not supported by EMF output.`);
    }
  }
  return style;
}

function parseTransform(value: string | null): Matrix {
  const result: Matrix = [...IDENTITY];
  if (!value) return result;
  const transforms = [...value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)];
  if (
    transforms.length === 0 ||
    transforms.map((match) => match[0].replace(/\s+/g, "")).join("") !== value.replace(/\s+/g, "")
  ) {
    throw new TypeError(`Invalid SVG transform: ${value}`);
  }
  for (const match of transforms) {
    const args = match[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (args.some((argument) => !Number.isFinite(argument))) {
      throw new TypeError(`Invalid SVG transform: ${value}`);
    }
    let transform: Matrix;
    switch (match[1]) {
      case "matrix":
        if (args.length !== 6) throw new TypeError(`Invalid SVG transform: ${value}`);
        transform = args as Matrix;
        break;
      case "translate":
        if (args.length < 1 || args.length > 2)
          throw new TypeError(`Invalid SVG transform: ${value}`);
        transform = [1, 0, 0, 1, args[0], args[1] ?? 0];
        break;
      case "scale":
        if (args.length < 1 || args.length > 2)
          throw new TypeError(`Invalid SVG transform: ${value}`);
        transform = [args[0], 0, 0, args[1] ?? args[0], 0, 0];
        break;
      case "rotate": {
        if (args.length !== 1 && args.length !== 3)
          throw new TypeError(`Invalid SVG transform: ${value}`);
        const radians = (args[0] * Math.PI) / 180;
        const cosine = Math.cos(radians);
        const sine = Math.sin(radians);
        const [cx, cy] = args.length === 3 ? [args[1], args[2]] : [0, 0];
        transform = [
          cosine,
          sine,
          -sine,
          cosine,
          cx - cosine * cx + sine * cy,
          cy - sine * cx - cosine * cy,
        ];
        break;
      }
      case "skewX":
        if (args.length !== 1) throw new TypeError(`Invalid SVG transform: ${value}`);
        transform = [1, 0, Math.tan((args[0] * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        if (args.length !== 1) throw new TypeError(`Invalid SVG transform: ${value}`);
        transform = [1, Math.tan((args[0] * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
        throw new TypeError(`Unsupported SVG transform: ${match[1]}`);
    }
    UDOC.M.concat(result, transform);
  }
  return result;
}

function combinedTransform(parent: Matrix, local: Matrix, viewport: Matrix): Matrix {
  const result: Matrix = [...local];
  UDOC.M.concat(result, parent);
  UDOC.M.concat(result, viewport);
  return result;
}

function shapePath(element: XmlElement): { data: string; open: boolean } | undefined {
  const attr = (name: string, fallback = "0") => element.getAttribute(name) ?? fallback;
  const points = (element.getAttribute("points") ?? "")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  switch (element.localName || element.tagName) {
    case "path":
      return { data: element.getAttribute("d") ?? "", open: false };
    case "line":
      return { data: `M${attr("x1")} ${attr("y1")}L${attr("x2")} ${attr("y2")}`, open: true };
    case "polyline":
    case "polygon": {
      if (points.length === 0) {
        return { data: "", open: element.localName === "polyline" };
      }
      if (
        points.length < 2 ||
        points.length % 2 !== 0 ||
        points.some((point) => !Number.isFinite(point))
      ) {
        throw new TypeError(`Invalid SVG ${element.localName} points.`);
      }
      const data = `M${points[0]} ${points[1]}${points.slice(2).reduce((path, point, index) => {
        return index % 2 === 0 ? `${path}L${point}` : `${path} ${point}`;
      }, "")}${element.localName === "polygon" ? "Z" : ""}`;
      return { data, open: element.localName === "polyline" };
    }
    case "rect": {
      const x = svgLength(attr("x"), 0);
      const y = svgLength(attr("y"), 0);
      const width = svgLength(attr("width"), 0);
      const height = svgLength(attr("height"), 0);
      if (width < 0 || height < 0)
        throw new TypeError("SVG rectangle dimensions cannot be negative.");
      const rawRx = element.getAttribute("rx");
      const rawRy = element.getAttribute("ry");
      const rx = Math.min(svgLength(rawRx ?? rawRy, 0), width / 2);
      const ry = Math.min(svgLength(rawRy ?? rawRx, 0), height / 2);
      if (width === 0 || height === 0) return { data: "", open: false };
      if (rx === 0 || ry === 0) {
        return { data: `M${x} ${y}H${x + width}V${y + height}H${x}Z`, open: false };
      }
      const k = 0.5522847498307936;
      return {
        data: `M${x + rx} ${y}H${x + width - rx}C${x + width - rx + k * rx} ${y} ${x + width} ${y + ry - k * ry} ${x + width} ${y + ry}V${y + height - ry}C${x + width} ${y + height - ry + k * ry} ${x + width - rx + k * rx} ${y + height} ${x + width - rx} ${y + height}H${x + rx}C${x + rx - k * rx} ${y + height} ${x} ${y + height - ry + k * ry} ${x} ${y + height - ry}V${y + ry}C${x} ${y + ry - k * ry} ${x + rx - k * rx} ${y} ${x + rx} ${y}Z`,
        open: false,
      };
    }
    case "circle":
    case "ellipse": {
      const cx = svgLength(attr("cx"), 0);
      const cy = svgLength(attr("cy"), 0);
      const rx = svgLength(attr(element.localName === "circle" ? "r" : "rx"), 0);
      const ry = element.localName === "circle" ? rx : svgLength(attr("ry"), 0);
      if (rx < 0 || ry < 0) throw new TypeError("SVG ellipse dimensions cannot be negative.");
      if (rx === 0 || ry === 0) return { data: "", open: false };
      const k = 0.5522847498307936;
      return {
        data: `M${cx + rx} ${cy}C${cx + rx} ${cy + k * ry} ${cx + k * rx} ${cy + ry} ${cx} ${cy + ry}C${cx - k * rx} ${cy + ry} ${cx - rx} ${cy + k * ry} ${cx - rx} ${cy}C${cx - rx} ${cy - k * ry} ${cx - k * rx} ${cy - ry} ${cx} ${cy - ry}C${cx + k * rx} ${cy - ry} ${cx + rx} ${cy - k * ry} ${cx + rx} ${cy}Z`,
        open: false,
      };
    }
    default:
      return undefined;
  }
}

function svgPath(data: string, matrix: Matrix): Path {
  const pathData = new SVGPathData(data)
    .toAbs()
    .normalizeHVZ(false)
    .normalizeST()
    .qtToC()
    .aToC()
    .matrix(...matrix);
  const path: Path = { cmds: [], crds: [] };
  for (const command of pathData.commands) {
    if (command.type === SVGPathData.MOVE_TO) {
      path.cmds.push("M");
      path.crds.push(command.x, command.y);
    } else if (command.type === SVGPathData.LINE_TO) {
      path.cmds.push("L");
      path.crds.push(command.x, command.y);
    } else if (command.type === SVGPathData.CURVE_TO) {
      path.cmds.push("C");
      path.crds.push(command.x1, command.y1, command.x2, command.y2, command.x, command.y);
    } else if (command.type === SVGPathData.CLOSE_PATH) {
      path.cmds.push("Z");
    } else {
      throw new TypeError("SVG path contains an unsupported command.");
    }
  }
  return path;
}

function int32Body(values: number[]): Uint8Array<ArrayBuffer> {
  const body = new Uint8Array(values.length * 4);
  const view = new DataView(body.buffer);
  values.forEach((value, index) => view.setInt32(index * 4, Math.round(value), true));
  return body;
}

class EmfWriter {
  #records: Uint8Array[] = [];
  #nextHandle = 1;

  constructor(width: number, height: number) {
    const header = new Uint8Array(80);
    const view = new DataView(header.buffer);
    view.setInt32(0, 0, true);
    view.setInt32(4, 0, true);
    view.setInt32(8, Math.ceil(width), true);
    view.setInt32(12, Math.ceil(height), true);
    view.setInt32(16, 0, true);
    view.setInt32(20, 0, true);
    view.setInt32(24, Math.ceil((width * 25.4 * 100) / 96), true);
    view.setInt32(28, Math.ceil((height * 25.4 * 100) / 96), true);
    header.set([0x20, 0x45, 0x4d, 0x46], 32);
    view.setUint32(36, 65536, true);
    view.setUint16(48, 1, true);
    view.setInt32(64, Math.ceil(width), true);
    view.setInt32(68, Math.ceil(height), true);
    view.setInt32(72, Math.ceil((width * 25.4) / 96), true);
    view.setInt32(76, Math.ceil((height * 25.4) / 96), true);
    const record = new Uint8Array(8 + header.length);
    const recordView = new DataView(record.buffer);
    recordView.setUint32(0, EMR.HEADER, true);
    recordView.setUint32(4, record.length, true);
    record.set(header, 8);
    this.#records.push(record);
  }

  #record(type: number, body: Uint8Array<ArrayBuffer> = new Uint8Array()): void {
    const record = new Uint8Array(8 + body.length);
    const view = new DataView(record.buffer);
    view.setUint32(0, type, true);
    view.setUint32(4, record.length, true);
    record.set(body, 8);
    this.#records.push(record);
  }

  #selectPen(color: Color, width: number): void {
    const handle = this.#nextHandle++;
    const body = new Uint8Array(20);
    const view = new DataView(body.buffer);
    view.setUint32(0, handle, true);
    view.setUint32(4, 0, true);
    view.setInt32(8, Math.max(1, Math.round(width)), true);
    view.setInt32(12, 0, true);
    view.setUint32(16, color[0] | (color[1] << 8) | (color[2] << 16), true);
    this.#record(EMR.CREATEPEN, body);
    this.#record(EMR.SELECTOBJECT, int32Body([handle]));
  }

  #selectBrush(color: Color): void {
    const handle = this.#nextHandle++;
    const body = new Uint8Array(16);
    const view = new DataView(body.buffer);
    view.setUint32(0, handle, true);
    view.setUint32(4, 0, true);
    view.setUint32(8, color[0] | (color[1] << 8) | (color[2] << 16), true);
    view.setUint32(12, 0, true);
    this.#record(EMR.CREATEBRUSHINDIRECT, body);
    this.#record(EMR.SELECTOBJECT, int32Body([handle]));
  }

  draw(path: Path, style: SvgStyle, transformScale: number): void {
    const fill = style.fill;
    const stroke = style.stroke;
    if (!fill && !stroke) return;
    if (this.#nextHandle >= 65535)
      throw new RangeError("SVG contains too many styled paths for EMF output.");

    if (fill) this.#selectBrush(fill);
    if (stroke) this.#selectPen(stroke, style.strokeWidth * transformScale);
    this.#record(EMR.SETPOLYFILLMODE, int32Body([style.fillRule === "evenodd" ? 1 : 2]));
    this.#record(EMR.BEGINPATH);

    let coordinateIndex = 0;
    const points: number[] = [];
    for (const command of path.cmds) {
      if (command === "M" || command === "L") {
        const x = path.crds[coordinateIndex++];
        const y = path.crds[coordinateIndex++];
        points.push(x, y);
        this.#record(command === "M" ? 0x1b : EMR.LINETO, int32Body([x, y]));
      } else if (command === "C") {
        const curve = path.crds.slice(coordinateIndex, coordinateIndex + 6);
        coordinateIndex += 6;
        points.push(...curve);
        const curveBounds = bounds(curve);
        this.#record(EMR.POLYBEZIERTO, int32Body([...curveBounds, 3, ...curve]));
      } else {
        this.#record(EMR.CLOSEFIGURE);
      }
    }

    this.#record(EMR.ENDPATH);
    const pathBounds = int32Body(bounds(points));
    this.#record(
      fill && stroke ? EMR.STROKEANDFILLPATH : fill ? EMR.FILLPATH : EMR.STROKEPATH,
      pathBounds,
    );
  }

  finish(): Uint8Array<ArrayBuffer> {
    const eof = new Uint8Array(12);
    new DataView(eof.buffer).setUint32(8, 20, true);
    this.#record(EMR.EOF, eof);
    const byteLength = this.#records.reduce((sum, record) => sum + record.length, 0);
    const output = new Uint8Array(byteLength);
    let offset = 0;
    for (const record of this.#records) {
      output.set(record, offset);
      offset += record.length;
    }
    const header = new DataView(output.buffer);
    header.setUint32(48, byteLength, true);
    header.setUint32(52, this.#records.length, true);
    header.setUint16(56, this.#nextHandle, true);
    return output;
  }
}

function bounds(coordinates: number[]): [number, number, number, number] {
  if (coordinates.length === 0) return [0, 0, 0, 0];
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let i = 0; i < coordinates.length; i += 2) {
    left = Math.min(left, coordinates[i]);
    top = Math.min(top, coordinates[i + 1]);
    right = Math.max(right, coordinates[i]);
    bottom = Math.max(bottom, coordinates[i + 1]);
  }
  return [left, top, right, bottom];
}

function svgToEmf(svg: string): Uint8Array<ArrayBuffer> {
  const doc = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") throw new TypeError(`Invalid SVG: ${message}`);
    },
  }).parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || (root.localName || root.tagName) !== "svg") {
    throw new TypeError("Input is not an SVG document.");
  }

  const viewBoxParts = (root.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (root.hasAttribute("viewBox")) {
    if (
      viewBoxParts.length !== 4 ||
      viewBoxParts.some((part) => !Number.isFinite(part)) ||
      viewBoxParts[2] <= 0 ||
      viewBoxParts[3] <= 0
    ) {
      throw new TypeError("Invalid SVG viewBox.");
    }
  }
  const viewBox =
    viewBoxParts.length === 4
      ? (viewBoxParts as [number, number, number, number])
      : ([0, 0, 0, 0] as [number, number, number, number]);
  const widthBase = viewBox[2] || 300;
  const heightBase = viewBox[3] || 150;
  const width = svgLength(root.getAttribute("width"), widthBase, widthBase);
  const height = svgLength(root.getAttribute("height"), heightBase, heightBase);
  if (width <= 0 || height <= 0) throw new TypeError("SVG dimensions must be positive.");

  const sourceBox: [number, number, number, number] =
    viewBox[2] > 0 && viewBox[3] > 0 ? viewBox : [0, 0, width, height];
  const sx = width / sourceBox[2];
  const sy = height / sourceBox[3];
  const preserve = (root.getAttribute("preserveAspectRatio") ?? "xMidYMid meet").trim();
  let viewport: Matrix;
  if (preserve.startsWith("none")) {
    viewport = [sx, 0, 0, sy, -sourceBox[0] * sx, -sourceBox[1] * sy];
  } else {
    const mode = preserve.split(/\s+/);
    const scale = mode[1] === "slice" ? Math.max(sx, sy) : Math.min(sx, sy);
    const align = mode[0] ?? "xMidYMid";
    const extraX = width - sourceBox[2] * scale;
    const extraY = height - sourceBox[3] * scale;
    const offsetX = align.includes("xMin") ? 0 : align.includes("xMax") ? extraX : extraX / 2;
    const offsetY = align.includes("YMin") ? 0 : align.includes("YMax") ? extraY : extraY / 2;
    viewport = [scale, 0, 0, scale, offsetX - sourceBox[0] * scale, offsetY - sourceBox[1] * scale];
  }

  const writer = new EmfWriter(width, height);
  const initialStyle: SvgStyle = {
    fill: [0, 0, 0],
    stroke: null,
    strokeWidth: 1,
    fillRule: "nonzero",
    display: "inline",
    visibility: "visible",
  };
  const ignoredElements = new Set([
    "defs",
    "metadata",
    "title",
    "desc",
    "style",
    "script",
    "clipPath",
    "mask",
    "linearGradient",
    "radialGradient",
    "pattern",
    "symbol",
  ]);

  const visit = (element: XmlElement, inherited: SvgStyle, parent: Matrix): void => {
    const name = element.localName || element.tagName;
    if (name === "style" && element.textContent?.trim()) {
      throw new TypeError("SVG stylesheets are not supported by EMF output.");
    }
    if (ignoredElements.has(name)) return;
    const style = elementStyle(element, inherited);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    ) {
      return;
    }
    if (name === "text" || name === "image" || name === "use" || name === "foreignObject") {
      throw new TypeError(`SVG <${name}> elements are not supported by EMF output.`);
    }

    const matrix = combinedTransform(
      parent,
      parseTransform(element.getAttribute("transform")),
      viewport,
    );
    const shape = shapePath(element);
    if (shape) {
      if (shape.data) {
        const shapeStyle = shape.open ? { ...style, fill: null } : style;
        const path = svgPath(shape.data, matrix);
        writer.draw(path, shapeStyle, UDOC.M.getScale(matrix));
      }
    } else if (
      name !== "svg" &&
      name !== "g" &&
      name !== "a" &&
      !["defs", "metadata", "title", "desc"].includes(name)
    ) {
      const hasElementChildren = Array.from(element.childNodes).some(
        (child) => child.nodeType === 1,
      );
      if (!hasElementChildren && !["stop"].includes(name)) {
        throw new TypeError(`Unsupported SVG element: <${name}>.`);
      }
    }

    for (let i = 0; i < element.childNodes.length; i++) {
      const child = element.childNodes.item(i);
      if (child?.nodeType === 1) visit(child as XmlElement, style, matrix);
    }
  };

  visit(root, initialStyle, IDENTITY);
  return writer.finish();
}

class emfHandler implements FormatHandler {
  public readonly name = "emf";
  public supportedFormats = [
    Formats.EMF.builder("emf").fromTo(),
    Formats.SVG.builder("svg").fromTo(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      if (inputFormat.internal === "emf" && outputFormat.internal === "svg") {
        const inputBuffer = new Uint8Array(inputFile.bytes.byteLength);
        inputBuffer.set(inputFile.bytes);
        const svg = await emf.convertMetafileToSvg(inputBuffer.buffer);
        if (svg === null) throw new Error(`Could not convert "${inputFile.name}" from EMF to SVG.`);
        outputFiles.push({
          name: changeExt(inputFile.name, outputFormat.extension),
          bytes: encode(svg),
        });
      } else if (inputFormat.internal === "svg" && outputFormat.internal === "emf") {
        outputFiles.push({
          name: changeExt(inputFile.name, outputFormat.extension),
          bytes: svgToEmf(decode(inputFile.bytes)),
        });
      } else {
        throw new TypeError(
          `Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`,
        );
      }
    }
    return outputFiles;
  }
}

export default emfHandler;
