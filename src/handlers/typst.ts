import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { TypstSnippet } from "@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs";
import { BadMagicError, EOFError, InitializationError } from "src/errors.ts";

export const TYPST_PAGEBREAK_MARKER = "CONVERTTYPSTPAGEBREAKTOKEN";
export const TYPST_ASSET_MANIFEST_START = "// convert-assets-start";
export const TYPST_ASSET_MANIFEST_END = "// convert-assets-end";

export function normalizeTypstAssetPaths(
  typstContent: string,
  shadowFiles: Record<string, Uint8Array>,
): string {
  const availablePaths = new Map<string, string>();

  for (const path of Object.keys(shadowFiles)) {
    const normalized = path
      .replace(/\\/gu, "/")
      .replace(/^\/+/u, "")
      .replace(/^\.\/+/u, "")
      .replace(/^(?:\.\.\/)+/u, "");
    availablePaths.set(normalized, path);
  }

  return typstContent.replace(/(["'])([^"'\\\n]+)\1/gu, (match, quote, candidatePath) => {
    const normalized = candidatePath
      .replace(/\\/gu, "/")
      .replace(/^\/+/u, "")
      .replace(/^\.\/+/u, "")
      .replace(/^(?:\.\.\/)+/u, "");
    const canonicalPath = availablePaths.get(normalized);
    if (!canonicalPath) return match;
    return `${quote}${canonicalPath}${quote}`;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function parseStyleAttribute(style: string): Map<string, string> {
  const entries = new Map<string, string>();

  for (const declaration of style.split(";")) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex === -1) continue;

    const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
    const value = declaration.slice(separatorIndex + 1).trim();
    if (!property || !value) continue;

    entries.set(property, value);
  }

  return entries;
}

function hasPageBreakValue(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "page" || normalized === "always";
}

function elementHasMeaningfulContent(element: Element): boolean {
  if (element.children.length > 0) return true;
  if ((element.textContent || "").trim().length > 0) return true;

  return [
    "img",
    "svg",
    "table",
    "hr",
    "video",
    "audio",
    "canvas",
    "iframe",
  ].includes(element.tagName.toLowerCase());
}

function shouldInsertPageBreakBefore(element: Element): boolean {
  const classList = element.classList;
  if (classList.contains("__page") || classList.contains("epub-section")) return true;

  const styles = parseStyleAttribute(element.getAttribute("style") || "");
  return hasPageBreakValue(styles.get("break-before"))
    || hasPageBreakValue(styles.get("page-break-before"));
}

function shouldInsertPageBreakAfter(element: Element): boolean {
  const styles = parseStyleAttribute(element.getAttribute("style") || "");
  return hasPageBreakValue(styles.get("break-after"))
    || hasPageBreakValue(styles.get("page-break-after"));
}

function createPageBreakMarker(document: Document): HTMLParagraphElement {
  const marker = document.createElement("p");
  marker.setAttribute("data-typst-pagebreak-marker", "true");
  marker.textContent = TYPST_PAGEBREAK_MARKER;
  return marker;
}

function appendTypstAttribute(
  element: Element,
  name: string,
  value: string | undefined,
) {
  if (!value || element.hasAttribute(name)) return;
  element.setAttribute(name, value);
}

function promoteImageDimensions(element: Element, styles: Map<string, string>) {
  if (element.tagName.toLowerCase() !== "img") return;

  const width = styles.get("width") || styles.get("max-width");
  const height = styles.get("height") || styles.get("max-height");

  if (width && !element.getAttribute("width")) {
    element.setAttribute("width", width);
  }
  if (height && !element.getAttribute("height")) {
    element.setAttribute("height", height);
  }
}

function applyTypstStyleHints(element: Element) {
  const style = element.getAttribute("style");
  if (!style) return;

  const styles = parseStyleAttribute(style);
  if (styles.size === 0) return;

  const tagName = element.tagName.toLowerCase();
  const inlineTextContainer = [
    "span",
    "a",
    "code",
    "kbd",
    "mark",
    "small",
    "sub",
    "sup",
  ].includes(tagName);
  const blockContainer = [
    "div",
    "p",
    "section",
    "article",
    "blockquote",
    "pre",
    "figure",
    "table",
    "td",
    "th",
  ].includes(tagName);

  if (inlineTextContainer) {
    appendTypstAttribute(element, "typst:text:fill", styles.get("color"));
    appendTypstAttribute(element, "typst:text:size", styles.get("font-size"));
    appendTypstAttribute(element, "typst:text:font", styles.get("font-family"));
  }

  if (blockContainer) {
    appendTypstAttribute(
      element,
      "typst:fill",
      styles.get("background") || styles.get("background-color"),
    );
    appendTypstAttribute(
      element,
      "typst:inset",
      styles.get("padding"),
    );
    appendTypstAttribute(
      element,
      "typst:stroke",
      styles.get("border"),
    );

    if (
      styles.get("break-inside")?.toLowerCase() === "avoid"
      || styles.get("page-break-inside")?.toLowerCase() === "avoid"
    ) {
      appendTypstAttribute(element, "typst:breakable", "false");
    }
  }

  promoteImageDimensions(element, styles);
}

export function preprocessHtmlForTypst(htmlContent: string): string {
  if (typeof DOMParser === "undefined") return htmlContent;

  const document = new DOMParser().parseFromString(htmlContent, "text/html");
  const elements = Array.from(document.body.querySelectorAll("*"));
  let sawMeaningfulContent = false;

  for (const element of elements) {
    if (
      shouldInsertPageBreakBefore(element)
      && sawMeaningfulContent
      && element.previousElementSibling?.getAttribute("data-typst-pagebreak-marker") !== "true"
    ) {
      element.before(createPageBreakMarker(document));
    }

    applyTypstStyleHints(element);

    if (elementHasMeaningfulContent(element)) {
      sawMeaningfulContent = true;
    }

    if (
      shouldInsertPageBreakAfter(element)
      && element.nextElementSibling?.getAttribute("data-typst-pagebreak-marker") !== "true"
    ) {
      element.after(createPageBreakMarker(document));
    }
  }

  return "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
}

export function postprocessTypstFromPandoc(typstContent: string): string {
  const escaped = escapeRegExp(TYPST_PAGEBREAK_MARKER);

  return typstContent.replace(
    new RegExp(`^.*${escaped}.*$`, "gmu"),
    // Typst rejects page breaks inside containers; col breaks are valid here.
    "#colbreak(weak: true)",
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export async function collectTypstAssetFiles(
  files: Record<string, any>,
  excludedPaths: string[] = [],
): Promise<Record<string, Uint8Array>> {
  const bundledAssets: Record<string, Uint8Array> = {};
  const excluded = new Set([
    "stdin",
    "stdout",
    "stderr",
    "warnings",
    "output",
    ...excludedPaths,
  ]);

  for (const [path, file] of Object.entries(files)) {
    if (excluded.has(path)) continue;
    if (!(file instanceof Blob)) continue;

    const arrayBuffer = await file.arrayBuffer();
    bundledAssets[path] = new Uint8Array(arrayBuffer);
  }

  return bundledAssets;
}

export async function bundleTypstAssets(
  typstContent: string,
  files: Record<string, any>,
  excludedPaths: string[] = [],
): Promise<string> {
  const shadowFiles = await collectTypstAssetFiles(files, excludedPaths);
  const assetPaths = Object.keys(shadowFiles);

  if (assetPaths.length === 0) return typstContent;
  const bundledAssets = Object.fromEntries(
    Object.entries(shadowFiles).map(([path, bytes]) => [path, bytesToBase64(bytes)]),
  );

  return [
    TYPST_ASSET_MANIFEST_START,
    `// ${JSON.stringify(bundledAssets)}`,
    TYPST_ASSET_MANIFEST_END,
    "",
    typstContent,
  ].join("\n");
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export function unpackTypstAssets(
  mainContent: string,
): { mainContent: string; shadowFiles: Record<string, Uint8Array> } {
  if (!mainContent.startsWith(TYPST_ASSET_MANIFEST_START)) {
    return { mainContent, shadowFiles: {} };
  }

  const newline = "\n";
  const manifestEndOffset = mainContent.indexOf(TYPST_ASSET_MANIFEST_END);
  if (manifestEndOffset === -1) {
    return { mainContent, shadowFiles: {} };
  }

  const manifestLineStart = TYPST_ASSET_MANIFEST_START.length + newline.length;
  const manifestRaw = mainContent
    .slice(manifestLineStart, manifestEndOffset)
    .trim()
    .replace(/^\/\/\s?/u, "");
  const remainderStart = manifestEndOffset + TYPST_ASSET_MANIFEST_END.length;
  const strippedContent = mainContent.slice(remainderStart).replace(/^\s+/u, "");

  if (!manifestRaw) {
    return { mainContent: strippedContent, shadowFiles: {} };
  }

  const parsedManifest = JSON.parse(manifestRaw) as Record<string, string>;
  const shadowFiles = Object.fromEntries(
    Object.entries(parsedManifest).map(([path, base64]) => [path, base64ToBytes(base64)]),
  );

  return {
    mainContent: strippedContent,
    shadowFiles,
  };
}

function parseSvgPageDimensions(svgBytes: Uint8Array): { widthPt: number; heightPt: number } {
  const head = new TextDecoder().decode(svgBytes.slice(0, 16384));
  const wAttr = head.match(/\bwidth="([\d.]+)\s*(?:px|pt)?"/i);
  const hAttr = head.match(/\bheight="([\d.]+)\s*(?:px|pt)?"/i);
  const vb = head.match(/viewBox="\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/i);
  let w = 960;
  let h = 540;
  if (wAttr && hAttr) {
    w = Number.parseFloat(wAttr[1]);
    h = Number.parseFloat(hAttr[1]);
  } else if (vb) {
    w = Number.parseFloat(vb[1]);
    h = Number.parseFloat(vb[2]);
  }
  return {
    widthPt: Math.max(1, Number.isFinite(w) ? w : 960),
    heightPt: Math.max(1, Number.isFinite(h) ? h : 540),
  };
}

class TypstHandler implements FormatHandler {
  public name: string = "typst";
  public ready: boolean = false;

  public supportedFormats: FileFormat[] = [
    CommonFormats.TYPST.supported("typst", true, false, true),
    CommonFormats.PDF.supported("pdf", false, true, true),
    CommonFormats.SVG.supported("svg", true, true, false),
  ];

  private $typst?: TypstSnippet;

  async init() {
    const { $typst: typst } = await import(
      "@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs"
    );

    typst.setCompilerInitOptions({
      getModule: () =>
        `${import.meta.env.BASE_URL}wasm/typst_ts_web_compiler_bg.wasm`,
    });
    typst.setRendererInitOptions({
      getModule: () =>
        `${import.meta.env.BASE_URL}wasm/typst_ts_renderer_bg.wasm`,
    });

    this.$typst = typst;
    this.ready = true;
  }

  private async svgFilesToSinglePdf(inputFiles: FileData[]): Promise<FileData[]> {
    const $typst = this.$typst!;
    const dimensions = inputFiles.map(file => parseSvgPageDimensions(file.bytes));

    const id = `s${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
    const shadowPaths: string[] = [];
    const imageBasenames: string[] = [];

    for (let i = 0; i < inputFiles.length; i++) {
      const basename = `${id}_${i}.svg`;
      const absPath = `/tmp/${basename}`;
      await $typst.mapShadow(absPath, inputFiles[i].bytes);
      shadowPaths.push(absPath);
      imageBasenames.push(basename);
    }

    const body = imageBasenames
      .map((basename, i) => {
        const { widthPt, heightPt } = dimensions[i];
        const page = `#set page(margin: 0pt, width: ${widthPt}pt, height: ${heightPt}pt)\n#box(width: 100%, height: 100%)[#image("${basename}", width: 100%, height: 100%)]`;
        return i < imageBasenames.length - 1 ? `${page}\n#pagebreak()\n` : page;
      })
      .join("\n");

    const mainContent = body;

    try {
      const pdfData = await $typst.pdf({ mainContent });
      if (!pdfData) throw new Error("Typst compilation to PDF failed.");
      const baseName = inputFiles[0].name.replace(/\.[^.]+$/u, "");
      return [{
        name: `${baseName}.pdf`,
        bytes: new Uint8Array(pdfData),
      }];
    } finally {
      for (const p of shadowPaths) {
        await $typst.unmapShadow(p);
      }
      await $typst.resetShadow();
    }
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (!this.ready || !this.$typst) throw new InitializationError("Handler not initialized.");

    if (inputFormat.internal === "svg" && outputFormat.internal === "svg") {
      return inputFiles.map(f => ({
        name: f.name,
        bytes: f.bytes.slice(),
      }));
    }

    if (inputFormat.internal === "svg" && outputFormat.internal === "pdf") {
      return this.svgFilesToSinglePdf(inputFiles);
    }

    const outputFiles: FileData[] = [];

    for (const file of inputFiles) {
      const { mainContent, shadowFiles } = unpackTypstAssets(new TextDecoder().decode(file.bytes));
      const baseName = file.name.replace(/\.[^.]+$/u, "");
      await this.$typst.resetShadow();

      for (const [path, bytes] of Object.entries(shadowFiles)) {
        const cleanPath = path.replace(/\\/gu, "/").replace(/^\/+/u, "");
        await this.$typst.mapShadow(`/${cleanPath}`, bytes);
      }

      await this.$typst.mapShadow("/main.typ", new TextEncoder().encode(mainContent));

      if (outputFormat.internal === "pdf") {
        const pdfData = await this.$typst.pdf({
          mainFilePath: "/main.typ",
          root: "/",
        });
        if (!pdfData) throw new Error("Typst compilation to PDF failed.");
        outputFiles.push({
          name: `${baseName}.pdf`,
          bytes: new Uint8Array(pdfData),
        });
      } else if (outputFormat.internal === "svg") {
        const svgString = await this.$typst.svg({
          mainFilePath: "/main.typ",
          root: "/",
        });
        outputFiles.push({
          name: `${baseName}.svg`,
          bytes: new TextEncoder().encode(svgString),
        });
      }
    }

    return outputFiles;
  }
}

export default TypstHandler;
