import { DOMParser, Element } from "@xmldom/xmldom";

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt, decode, encode } from "src/common/index.ts";

// Reimplements the mapping from RohanTalip/VectorDrawable2Svg (logic only)
// in TypeScript: viewport -> viewBox, dp dimensions, group pivots/scales,
// pathData, ARGB colors, evenOdd fill types and @color references.

const ANDROID_NS = "http://schemas.android.com/apk/res/android";

// Element type of documents produced by @xmldom/xmldom (structurally close to
// DOM Element, but a distinct type, so it gets its own alias).
type XmlElement = NonNullable<
  ReturnType<InstanceType<typeof DOMParser>["parseFromString"]>["documentElement"]
>;

function vdAttr(el: XmlElement, name: string): string | undefined {
  const namespaced = el.getAttributeNS(ANDROID_NS, name) || el.getAttribute(`android:${name}`);
  if (namespaced !== null && namespaced !== "") return namespaced;
  const plain = el.getAttribute(name);
  if (plain !== null && plain !== "") return plain;
  return undefined;
}

function svgAttr(el: XmlElement, style: Record<string, string>, name: string): string | undefined {
  const direct = el.getAttribute(name);
  if (direct !== null && direct !== "") return direct;
  const fromStyle = style[name];
  if (fromStyle !== undefined && fromStyle !== "") return fromStyle;
  return undefined;
}

function parseStyle(el: XmlElement): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = el.getAttribute("style");
  if (raw === null || raw === "") return out;
  for (const declaration of raw.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    const key = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 10000) / 10000);
}

function fmtOpacity(value: number): string {
  const clamped = Math.min(1, Math.max(0, value));
  return String(Math.round(clamped * 10000) / 10000);
}

function parseNum(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function alphaByteToOpacity(hex: string): number {
  return parseInt(hex, 16) / 255;
}

function opacityToAlphaByte(opacity: number): string {
  return Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

interface SvgPaint {
  color: string;
  opacity: number;
}

/// Splits an Android color (`#RGB`, `#ARGB`, `#RRGGBB`, `#AARRGGBB`,
/// `@color/name` or `?attr/name`) into an SVG color plus opacity.
/// Unresolvable `@color/` / `?attr/` references are passed through untouched.
function vdColorToSvg(value: string, alpha: number): SvgPaint {
  if (value.startsWith("@") || value.startsWith("?")) return { color: value, opacity: alpha };
  const match = value.match(/^#([0-9a-fA-F]+)$/);
  if (!match) return { color: value, opacity: alpha };
  const hex = match[1];
  if (hex.length === 3) {
    return {
      color: `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`,
      opacity: alpha,
    };
  }
  if (hex.length === 4) {
    return {
      color: `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`,
      opacity: alpha * alphaByteToOpacity(hex[0] + hex[0]),
    };
  }
  if (hex.length === 6) return { color: `#${hex}`, opacity: alpha };
  if (hex.length === 8) {
    return {
      color: `#${hex.slice(2)}`,
      opacity: alpha * alphaByteToOpacity(hex.slice(0, 2)),
    };
  }
  return { color: value, opacity: alpha };
}

interface VdPaint {
  color?: string;
  alpha?: number;
}

/// Splits an SVG fill/stroke plus opacity into an Android color and an
/// optional `fillAlpha`/`strokeAlpha`. `none` maps to no color.
function svgColorToVd(color: string | undefined, opacity: number): VdPaint {
  if (color === undefined || color === "none") return {};
  if (color.toLowerCase() === "currentcolor") color = "#000000";
  const rgbMatch = color.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/i);
  if (rgbMatch) {
    color = `#${rgbMatch
      .slice(1, 4)
      .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0"))
      .join("")}`;
  }
  const hexMatch = color.match(/^#([0-9a-fA-F]+)$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      const expanded = `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
      return opacity >= 0.9999
        ? { color: `#${expanded}` }
        : { color: `#${expanded}`, alpha: opacity };
    }
    if (hex.length === 6) {
      return opacity >= 0.9999 ? { color: `#${hex}` } : { color: `#${hex}`, alpha: opacity };
    }
    if (hex.length === 8) {
      // SVG #RRGGBBAA -> Android #AARRGGBB, multiplied by the opacity.
      const combined = opacity * alphaByteToOpacity(hex.slice(6));
      return { color: `#${opacityToAlphaByte(combined)}${hex.slice(0, 6)}` };
    }
  }
  // @color/?attr references that survived a round-trip are kept verbatim.
  // Anything else (named colors, url(#gradient), hsl()) is not a valid
  // Android color and is dropped.
  if (!color.startsWith("@") && !color.startsWith("?")) return {};
  return opacity >= 0.9999 ? { color } : { color, alpha: opacity };
}

function childElements(el: XmlElement): XmlElement[] {
  const out: XmlElement[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes.item(i);
    if (node instanceof Element) out.push(node);
  }
  return out;
}

function localName(el: XmlElement): string {
  const tag = el.tagName ?? "";
  const colon = tag.indexOf(":");
  return colon === -1 ? tag : tag.slice(colon + 1);
}

function findFirst(el: XmlElement, name: string): XmlElement | undefined {
  if (localName(el) === name) return el;
  for (const child of childElements(el)) {
    const found = findFirst(child, name);
    if (found) return found;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// VectorDrawable -> SVG
// ---------------------------------------------------------------------------

let clipIdCounter = 0;

function convertVdPath(path: XmlElement, indent: string): string {
  const pathData = vdAttr(path, "pathData");
  if (pathData === undefined) return "";

  const name = vdAttr(path, "name");
  const attrs: string[] = [`d="${esc(pathData)}"`];

  const fillRaw = vdAttr(path, "fillColor");
  const fillAlpha = parseNum(vdAttr(path, "fillAlpha"), 1);
  if (fillRaw !== undefined) {
    const { color, opacity } = vdColorToSvg(fillRaw, fillAlpha);
    attrs.push(`fill="${esc(color)}"`);
    if (opacity < 0.9999) attrs.push(`fill-opacity="${fmtOpacity(opacity)}"`);
  } else {
    attrs.push(`fill="none"`);
  }

  const fillType = vdAttr(path, "fillType");
  if (fillType !== undefined && fillType.toLowerCase() === "evenodd") {
    attrs.push(`fill-rule="evenodd"`);
  }

  // Android's default strokeWidth is 0 (no stroke), SVG's is 1.
  const strokeRaw = vdAttr(path, "strokeColor");
  const strokeAlpha = parseNum(vdAttr(path, "strokeAlpha"), 1);
  const strokeWidth = parseNum(vdAttr(path, "strokeWidth"), 0);
  if (strokeRaw !== undefined && strokeWidth > 0) {
    const { color, opacity } = vdColorToSvg(strokeRaw, strokeAlpha);
    attrs.push(`stroke="${esc(color)}"`, `stroke-width="${fmtNum(strokeWidth)}"`);
    if (opacity < 0.9999) attrs.push(`stroke-opacity="${fmtOpacity(opacity)}"`);
  }

  const lineCap = vdAttr(path, "strokeLineCap");
  if (lineCap !== undefined) attrs.push(`stroke-linecap="${esc(lineCap)}"`);
  const lineJoin = vdAttr(path, "strokeLineJoin");
  if (lineJoin !== undefined) attrs.push(`stroke-linejoin="${esc(lineJoin)}"`);
  const miterLimit = vdAttr(path, "strokeMiterLimit");
  if (miterLimit !== undefined) attrs.push(`stroke-miterlimit="${esc(miterLimit)}"`);

  if (name !== undefined) attrs.unshift(`id="${esc(name)}"`);
  return `${indent}<path ${attrs.join(" ")}/>`;
}

/// Builds the SVG transform for a VectorDrawable group. Android applies the
/// pivot-centered scale/rotation first, then the translation.
function vdGroupTransform(group: XmlElement): string {
  const translateX = parseNum(vdAttr(group, "translateX"), 0);
  const translateY = parseNum(vdAttr(group, "translateY"), 0);
  const pivotX = parseNum(vdAttr(group, "pivotX"), 0);
  const pivotY = parseNum(vdAttr(group, "pivotY"), 0);
  const scaleX = parseNum(vdAttr(group, "scaleX"), 1);
  const scaleY = parseNum(vdAttr(group, "scaleY"), 1);
  const rotation = parseNum(vdAttr(group, "rotation"), 0);

  const parts: string[] = [];
  if (translateX !== 0 || translateY !== 0) {
    parts.push(`translate(${fmtNum(translateX)} ${fmtNum(translateY)})`);
  }
  const hasPivot = pivotX !== 0 || pivotY !== 0;
  const hasPivotTransform = scaleX !== 1 || scaleY !== 1 || rotation !== 0;
  if (hasPivot && hasPivotTransform) parts.push(`translate(${fmtNum(pivotX)} ${fmtNum(pivotY)})`);
  if (rotation !== 0) parts.push(`rotate(${fmtNum(rotation)})`);
  if (scaleX !== 1 || scaleY !== 1) parts.push(`scale(${fmtNum(scaleX)} ${fmtNum(scaleY)})`);
  if (hasPivot && hasPivotTransform) {
    parts.push(`translate(${fmtNum(-pivotX)} ${fmtNum(-pivotY)})`);
  }
  return parts.join(" ");
}

function convertVdGroup(group: XmlElement, indent: string): string {
  const lines: string[] = [];
  const children = childElements(group).filter(
    (c) => localName(c) === "group" || localName(c) === "path" || localName(c) === "clip-path",
  );

  // VectorDrawable clip-paths clip the rest of their group and intersect
  // with each other; map each to an SVG clipPath on its own nested <g>.
  const clipIds: string[] = [];
  for (const clip of children.filter((c) => localName(c) === "clip-path")) {
    const d = vdAttr(clip, "pathData");
    if (d === undefined) continue;
    const id = `vd-clip-${clipIdCounter++}`;
    lines.push(`${indent}<clipPath id="${id}"><path d="${esc(d)}"/></clipPath>`);
    clipIds.push(id);
  }

  const transform = vdGroupTransform(group);
  const name = vdAttr(group, "name");
  const openAttrs =
    (name !== undefined ? ` id="${esc(name)}"` : "") +
    (transform ? ` transform="${transform}"` : "");

  const inner: string[] = [];
  for (const child of children) {
    const tag = localName(child);
    const converted =
      tag === "group"
        ? convertVdGroup(child, `${indent}  `)
        : tag === "path"
          ? convertVdPath(child, `${indent}  `)
          : "";
    if (converted) inner.push(converted);
  }

  if (inner.length === 0) return "";
  lines.push(`${indent}<g${openAttrs}>`);
  for (const id of clipIds) lines.push(`${indent}<g clip-path="url(#${id})">`);
  lines.push(...inner);
  for (const _ of clipIds) lines.push(`${indent}</g>`);
  lines.push(`${indent}</g>`);
  return lines.join("\n");
}

function vectorDrawableToSvg(text: string): string {
  clipIdCounter = 0;
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (!doc.documentElement) throw new Error("Not an Android VectorDrawable: invalid XML.");
  const vector = findFirst(doc.documentElement, "vector");
  if (!vector) throw new Error("Not an Android VectorDrawable: missing <vector> root element.");

  const viewportWidth = parseNum(vdAttr(vector, "viewportWidth") ?? vdAttr(vector, "width"), 24);
  const viewportHeight = parseNum(vdAttr(vector, "viewportHeight") ?? vdAttr(vector, "height"), 24);
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) {
    throw new Error("Invalid Android VectorDrawable: bad viewport dimensions.");
  }
  const width = parseNum(vdAttr(vector, "width"), viewportWidth);
  const height = parseNum(vdAttr(vector, "height"), viewportHeight);

  const alpha = parseNum(vdAttr(vector, "alpha"), 1);
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmtNum(width)}" height="${fmtNum(height)}" viewBox="0 0 ${fmtNum(viewportWidth)} ${fmtNum(viewportHeight)}"${alpha < 0.9999 ? ` opacity="${fmtOpacity(alpha)}"` : ""}>`,
  ];
  // The <vector> root behaves like a group (it can hold clip-paths too).
  const content = convertVdGroup(vector, "  ");
  if (content) lines.push(content);
  lines.push(`</svg>`);
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// SVG -> VectorDrawable
// ---------------------------------------------------------------------------

interface VdGroupAttrs {
  translateX?: number;
  translateY?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  pivotX?: number;
  pivotY?: number;
}

/// Decomposes an SVG transform list into nested VectorDrawable groups.
/// SVG applies transforms left-to-right, which nests exactly like groups.
function svgTransformToGroups(transform: string): VdGroupAttrs[] {
  const groups: VdGroupAttrs[] = [];
  const funcPattern = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  let consumed = false;
  while ((match = funcPattern.exec(transform)) !== null) {
    consumed = true;
    const kind = match[1].toLowerCase();
    // Matches numbers even without separators, e.g. "10-5" or "1.5.5".
    const args = (match[2].match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    if (kind === "translate") {
      groups.push({ translateX: args[0] ?? 0, translateY: args[1] ?? 0 });
    } else if (kind === "scale") {
      groups.push({ scaleX: args[0] ?? 1, scaleY: args[1] ?? args[0] ?? 1 });
    } else if (kind === "rotate") {
      groups.push({
        rotation: args[0] ?? 0,
        ...(args.length >= 3 ? { pivotX: args[1], pivotY: args[2] } : {}),
      });
    } else if (kind === "matrix") {
      if (args.length !== 6) throw new Error(`Unsupported SVG transform: "${transform}".`);
      const [a, b, c, d, e, f] = args;
      // A group applies translate * rotate * scale, so any matrix without
      // skew (orthogonal columns) decomposes into a single group.
      const scaleX = Math.hypot(a, b);
      if (scaleX === 0 || Math.abs(a * c + b * d) > 1e-6) {
        throw new Error(`Unsupported SVG transform: "${transform}".`);
      }
      groups.push({
        translateX: e,
        translateY: f,
        rotation: (Math.atan2(b, a) * 180) / Math.PI,
        scaleX,
        scaleY: (a * d - b * c) / scaleX,
      });
    } else {
      throw new Error(`Unsupported SVG transform: "${transform}".`);
    }
  }
  if (!consumed && transform.trim() !== "") {
    throw new Error(`Unsupported SVG transform: "${transform}".`);
  }
  return groups;
}

function openVdGroup(attrs: VdGroupAttrs, name: string | undefined, indent: string): string {
  const parts: string[] = [];
  if (name !== undefined) parts.push(`android:name="${esc(name)}"`);
  if (attrs.rotation !== undefined && attrs.rotation !== 0) {
    parts.push(`android:rotation="${fmtNum(attrs.rotation)}"`);
  }
  if (attrs.pivotX !== undefined && attrs.pivotX !== 0) {
    parts.push(`android:pivotX="${fmtNum(attrs.pivotX)}"`);
  }
  if (attrs.pivotY !== undefined && attrs.pivotY !== 0) {
    parts.push(`android:pivotY="${fmtNum(attrs.pivotY)}"`);
  }
  if (attrs.scaleX !== undefined && attrs.scaleX !== 1) {
    parts.push(`android:scaleX="${fmtNum(attrs.scaleX)}"`);
  }
  if (attrs.scaleY !== undefined && attrs.scaleY !== 1) {
    parts.push(`android:scaleY="${fmtNum(attrs.scaleY)}"`);
  }
  if (attrs.translateX !== undefined && attrs.translateX !== 0) {
    parts.push(`android:translateX="${fmtNum(attrs.translateX)}"`);
  }
  if (attrs.translateY !== undefined && attrs.translateY !== 0) {
    parts.push(`android:translateY="${fmtNum(attrs.translateY)}"`);
  }
  return `${indent}<group${parts.length > 0 ? ` ${parts.join(" ")}` : ""}>`;
}

// Presentation attributes that SVG inherits from ancestors.
const INHERITED_PAINT = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
];

function inheritPaint(
  el: XmlElement,
  style: Record<string, string>,
  parent: Record<string, string>,
) {
  const paint = { ...parent };
  for (const name of INHERITED_PAINT) {
    const value = svgAttr(el, style, name);
    if (value !== undefined && value !== "inherit") paint[name] = value;
  }
  return paint;
}

/// Converts basic SVG shapes into equivalent path data.
function shapeToPathData(el: XmlElement, tag: string): string | undefined {
  const n = (name: string) => parseNum(el.getAttribute(name) ?? undefined, 0);
  if (tag === "path") return el.getAttribute("d") || undefined;
  if (tag === "rect") {
    const [x, y, w, h] = [n("x"), n("y"), n("width"), n("height")];
    if (!(w > 0) || !(h > 0)) return undefined;
    let rx = el.hasAttribute("rx") ? n("rx") : n("ry");
    let ry = el.hasAttribute("ry") ? n("ry") : rx;
    rx = Math.min(Math.max(rx, 0), w / 2);
    ry = Math.min(Math.max(ry, 0), h / 2);
    if (rx === 0 || ry === 0) return `M${x} ${y}h${w}v${h}h${-w}Z`;
    const a = (dx: number, dy: number) => `a${rx} ${ry} 0 0 1 ${dx} ${dy}`;
    return (
      `M${x + rx} ${y}h${w - 2 * rx}${a(rx, ry)}v${h - 2 * ry}${a(-rx, ry)}` +
      `h${2 * rx - w}${a(-rx, -ry)}v${2 * ry - h}${a(rx, -ry)}Z`
    );
  }
  if (tag === "circle" || tag === "ellipse") {
    const rx = tag === "circle" ? n("r") : n("rx");
    const ry = tag === "circle" ? rx : n("ry");
    if (!(rx > 0) || !(ry > 0)) return undefined;
    const [cx, cy] = [n("cx"), n("cy")];
    return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
  }
  if (tag === "line") return `M${n("x1")} ${n("y1")}L${n("x2")} ${n("y2")}`;
  if (tag === "polyline" || tag === "polygon") {
    const points = el.getAttribute("points")?.trim();
    if (!points) return undefined;
    return `M${points}${tag === "polygon" ? "Z" : ""}`;
  }
  return undefined;
}

function convertSvgPath(
  path: XmlElement,
  d: string,
  paint: Record<string, string>,
  opacity: number,
  indent: string,
): string {
  const attrs: string[] = [`android:pathData="${esc(d)}"`];
  const name = path.getAttribute("id");
  if (name !== null && name !== "") attrs.unshift(`android:name="${esc(name)}"`);

  // SVG fills with black by default; Android leaves paths unfilled.
  const fillOpacity = parseNum(paint["fill-opacity"], 1) * opacity;
  const fill = svgColorToVd(paint.fill ?? "#000000", fillOpacity);
  if (fill.color !== undefined) {
    attrs.push(`android:fillColor="${esc(fill.color)}"`);
    if (fill.alpha !== undefined && fill.alpha < 0.9999) {
      attrs.push(`android:fillAlpha="${fmtOpacity(fill.alpha)}"`);
    }
  }

  if (paint["fill-rule"]?.toLowerCase() === "evenodd") {
    attrs.push(`android:fillType="evenOdd"`);
  }

  // SVG's default stroke-width is 1; Android's is 0.
  const strokeOpacity = parseNum(paint["stroke-opacity"], 1) * opacity;
  const stroke = svgColorToVd(paint.stroke, strokeOpacity);
  const strokeWidth = parseNum(paint["stroke-width"], 1);
  if (stroke.color !== undefined && strokeWidth > 0) {
    attrs.push(`android:strokeColor="${esc(stroke.color)}"`);
    if (stroke.alpha !== undefined && stroke.alpha < 0.9999) {
      attrs.push(`android:strokeAlpha="${fmtOpacity(stroke.alpha)}"`);
    }
    attrs.push(`android:strokeWidth="${fmtNum(strokeWidth)}"`);
    const lineCap = paint["stroke-linecap"];
    if (lineCap !== undefined) attrs.push(`android:strokeLineCap="${esc(lineCap)}"`);
    const lineJoin = paint["stroke-linejoin"];
    if (lineJoin !== undefined) attrs.push(`android:strokeLineJoin="${esc(lineJoin)}"`);
    const miterLimit = paint["stroke-miterlimit"];
    if (miterLimit !== undefined) {
      attrs.push(`android:strokeMiterLimit="${fmtNum(parseNum(miterLimit, 4))}"`);
    }
  }

  return `${indent}<path ${attrs.join(" ")}/>`;
}

function convertSvgChildren(
  el: XmlElement,
  paint: Record<string, string>,
  inheritedOpacity: number,
  indent: string,
): string[] {
  const lines: string[] = [];
  for (const child of childElements(el)) {
    const tag = localName(child).toLowerCase();
    if (tag === "defs" || tag === "metadata" || tag === "title" || tag === "desc") continue;
    if (tag === "clippath" || tag === "mask" || tag === "symbol") continue;
    const style = parseStyle(child);
    if (svgAttr(child, style, "display") === "none") continue;
    if (tag === "g" || tag === "svg" || tag === "a") {
      lines.push(...convertSvgGroup(child, paint, inheritedOpacity, indent));
      continue;
    }
    // Other elements (text, image, use, ...) have no VectorDrawable equivalent.
    const d = shapeToPathData(child, tag);
    if (d === undefined) continue;
    const opacity = inheritedOpacity * parseNum(svgAttr(child, style, "opacity"), 1);
    const path = convertSvgPath(child, d, inheritPaint(child, style, paint), opacity, indent);
    lines.push(...wrapInGroups([path], parseTransform(child), undefined, indent));
  }
  return lines;
}

function convertSvgGroup(
  el: XmlElement,
  parentPaint: Record<string, string>,
  inheritedOpacity: number,
  indent: string,
  outerWrappers: VdGroupAttrs[] = [],
): string[] {
  const style = parseStyle(el);
  const elementOpacity = parseNum(svgAttr(el, style, "opacity"), 1);
  const opacity = inheritedOpacity * elementOpacity;
  const paint = inheritPaint(el, style, parentPaint);

  const name = el.getAttribute("id");
  const groupName = name !== null && name !== "" ? name : undefined;

  let wrappers = [...outerWrappers, ...parseTransform(el)];

  const isGroup = localName(el).toLowerCase() === "g";
  // A plain <g> with no transform flattens away, unless it carries a name
  // worth preserving as android:name.
  if (isGroup && wrappers.length === 0 && groupName !== undefined) wrappers = [{}];

  const inner = convertSvgChildren(el, paint, opacity, indent);
  if (inner.length === 0) return [];
  return wrapInGroups(inner, wrappers, isGroup ? groupName : undefined, indent);
}

/// Parses an element's transform; skew transforms can't be represented and throw.
function parseTransform(el: XmlElement): VdGroupAttrs[] {
  const transform = el.getAttribute("transform");
  return transform ? svgTransformToGroups(transform) : [];
}

/// Nests already-converted lines inside one VectorDrawable group per wrapper.
function wrapInGroups(
  inner: string[],
  wrappers: VdGroupAttrs[],
  name: string | undefined,
  indent: string,
): string[] {
  if (wrappers.length === 0) return inner;
  const pad = "  ".repeat(wrappers.length);
  return [
    ...wrappers.map((attrs, i) =>
      openVdGroup(attrs, i === 0 ? name : undefined, `${indent}${"  ".repeat(i)}`),
    ),
    ...inner.map((line) => `${pad}${line}`),
    ...wrappers.map((_, i) => `${indent}${"  ".repeat(wrappers.length - 1 - i)}</group>`),
  ];
}

function svgToVectorDrawable(text: string): string {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (!doc.documentElement) throw new Error("Not an SVG image: invalid XML.");
  const svg = findFirst(doc.documentElement, "svg");
  if (!svg) throw new Error("Not an SVG image: missing <svg> root element.");

  const viewBox = svg.getAttribute("viewBox") ?? "";
  const viewBoxNums = viewBox
    .split(/[\s,]+/)
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  // Percentages are relative to an unknown container, so ignore them.
  const length = (name: string) => {
    const value = svg.getAttribute(name);
    return value === null || value.trim().endsWith("%") ? undefined : value;
  };
  const widthAttr = length("width");
  const heightAttr = length("height");

  let viewportWidth = 24;
  let viewportHeight = 24;
  let minX = 0;
  let minY = 0;
  if (viewBoxNums.length >= 4) {
    [minX, minY, viewportWidth, viewportHeight] = viewBoxNums;
  } else {
    viewportWidth = parseNum(widthAttr, viewportWidth);
    viewportHeight = parseNum(heightAttr, viewportHeight);
  }
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) {
    throw new Error("Invalid SVG: bad viewport dimensions.");
  }
  const width = parseNum(widthAttr, viewportWidth);
  const height = parseNum(heightAttr, viewportHeight);

  const lines: string[] = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<vector xmlns:android="${ANDROID_NS}"`,
    `    android:width="${fmtNum(width)}dp"`,
    `    android:height="${fmtNum(height)}dp"`,
    `    android:viewportWidth="${fmtNum(viewportWidth)}"`,
    `    android:viewportHeight="${fmtNum(viewportHeight)}">`,
  ];

  // A viewBox origin other than 0,0 becomes an outer translation.
  const viewBoxShift = minX !== 0 || minY !== 0 ? [{ translateX: -minX, translateY: -minY }] : [];
  lines.push(...convertSvgGroup(svg, {}, 1, "    ", viewBoxShift));
  lines.push(`</vector>`);
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

class vectorDrawableHandler implements FormatHandler {
  public readonly name = "vectorDrawable";
  public supportedFormats = [
    Formats.VECTORDRAWABLE.builder("vectordrawable").fromTo(),
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
      const text = decode(inputFile.bytes);
      let converted: string;
      if (inputFormat.internal === "vectordrawable" && outputFormat.internal === "svg") {
        converted = vectorDrawableToSvg(text);
      } else if (inputFormat.internal === "svg" && outputFormat.internal === "vectordrawable") {
        converted = svgToVectorDrawable(text);
      } else {
        throw new TypeError(
          `Unsupported conversion: ${inputFormat.internal} -> ${outputFormat.internal}`,
        );
      }
      outputFiles.push({
        name: changeExt(inputFile.name, outputFormat.extension),
        bytes: encode(converted),
      });
    }
    return outputFiles;
  }
}

export default vectorDrawableHandler;
