import CommonFormats, { Category } from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { TypstSnippet } from "@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs";
import { MemoryAccessModel } from "@myriaddreamin/typst.ts/fs/memory";
import type { ConvertContext } from "../ui/ProgressStore.js";
import {
  TYPST_ASSET_MANIFEST_END,
  TYPST_ASSET_MANIFEST_START,
} from "./pandoc.ts";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * @param mainContent Typst source that may start with an asset manifest block.
 * @returns The cleaned Typst source and a map of shadow file paths to their bytes.
 */
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

  return { mainContent: strippedContent, shadowFiles };
}

function parseSvgPageDimensions(svgBytes: Uint8Array): { widthPt: number; heightPt: number } {
  const head = new TextDecoder().decode(svgBytes.slice(0, 16384));
  const wAttr = /\bwidth="([\d.]+)\s*(?:px|pt)?"/i.exec(head);
  const hAttr = /\bheight="([\d.]+)\s*(?:px|pt)?"/i.exec(head);
  const vb = /viewBox="\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/i.exec(head);
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
    CommonFormats.PDF.supported("pdf", false, true),
    CommonFormats.SVG.supported("svg", true, true, false, {
      category: [Category.IMAGE, Category.VECTOR, Category.DOCUMENT],
    }),
  ];

  private $typst?: TypstSnippet;

  async init() {
    const { TypstSnippet } = await import(
      "@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs"
    );
    const typst = new TypstSnippet();

    typst.setCompilerInitOptions({
      getModule: () =>
        `${import.meta.env.BASE_URL}wasm/typst_ts_web_compiler_bg.wasm`,
    });
    typst.setRendererInitOptions({
      getModule: () =>
        `${import.meta.env.BASE_URL}wasm/typst_ts_renderer_bg.wasm`,
    });

    const accessModel = new MemoryAccessModel();
    typst.use(TypstSnippet.withAccessModel(accessModel));

    this.$typst = typst;
    this.ready = true;
  }

  /**
   * Converts N SVG files into a single multi-page PDF.
   * Each SVG becomes one page, sized to match the first SVG's dimensions.
   */
  private async svgFilesToSinglePdf(
    inputFiles: FileData[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const $typst = this.$typst!;
    const { widthPt, heightPt } = parseSvgPageDimensions(inputFiles[0].bytes);

    const id = `s${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
    const shadowPaths: string[] = [];
    const imageBasenames: string[] = [];

    ctx?.log(`Mapping ${inputFiles.length} SVG slide(s) for Typst (${widthPt}×${heightPt}pt)...`);

    for (let i = 0; i < inputFiles.length; i++) {
      ctx?.throwIfAborted();
      const basename = `${id}_${i}.svg`;
      const absPath = `/tmp/${basename}`;
      await $typst.mapShadow(absPath, inputFiles[i].bytes);
      shadowPaths.push(absPath);
      imageBasenames.push(basename);
    }

    const body = imageBasenames
      .map((basename, i) => {
        const page = `#box(width: 100%, height: 100%)[#image("${basename}", width: 100%, height: 100%)]`;
        return i < imageBasenames.length - 1 ? `${page}\n#pagebreak()\n` : page;
      })
      .join("\n");

    const mainContent = `#set page(margin: 0pt, width: ${widthPt}pt, height: ${heightPt}pt)\n${body}\n`;

    ctx?.progress("Compiling SVG slides to PDF...", 0.85);
    ctx?.log("Compiling Typst document to PDF...");

    try {
      const pdfData = await $typst.pdf({ mainContent });
      if (!pdfData) throw new Error("Typst compilation to PDF failed.");
      const baseName = inputFiles[0].name.replace(/\.[^.]+$/u, "");
      ctx?.progress("Conversion complete!", 1);
      return [{
        name: `${baseName}.pdf`,
        bytes: new Uint8Array(pdfData),
      }];
    } finally {
      for (const p of shadowPaths) {
        await $typst.unmapShadow(p);
      }
    }
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    if (!this.ready || !this.$typst) throw new Error("Handler not initialized.");

    if (inputFormat.internal === "svg" && outputFormat.internal === "svg") {
      return inputFiles.map(f => ({ name: f.name, bytes: f.bytes.slice() }));
    }

    if (inputFormat.internal === "svg" && outputFormat.internal === "pdf") {
      ctx?.progress("Starting SVG → PDF conversion...", 0);
      return this.svgFilesToSinglePdf(inputFiles, ctx);
    }

    const outputFiles: FileData[] = [];

    for (let i = 0; i < inputFiles.length; i++) {
      const file = inputFiles[i];
      const fileProgress = i / inputFiles.length;
      ctx?.progress(`Processing ${file.name}...`, fileProgress);

      const { mainContent, shadowFiles } = unpackTypstAssets(new TextDecoder().decode(file.bytes));
      const baseName = file.name.replace(/\.[^.]+$/u, "");
      await this.$typst.resetShadow();

      const shadowEntries = Object.entries(shadowFiles);
      if (shadowEntries.length > 0) {
        ctx?.log(`Mapping ${shadowEntries.length} shadow files...`);
      }
      for (const [path, bytes] of shadowEntries) {
        const cleanPath = path.replaceAll("\\", "/").replace(/^\/+/u, "");
        await this.$typst.mapShadow(`/${cleanPath}`, bytes);
      }

      await this.$typst.mapShadow("/main.typ", new TextEncoder().encode(mainContent));

      if (outputFormat.internal === "pdf") {
        ctx?.progress(`Compiling to PDF...`, fileProgress + 0.5 / inputFiles.length);
        ctx?.log("Compiling Typst to PDF...");
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
        ctx?.progress(`Compiling to SVG...`, fileProgress + 0.5 / inputFiles.length);
        ctx?.log("Compiling Typst to SVG...");
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

    ctx?.progress("Conversion complete!", 1);
    return outputFiles;
  }
}

export default TypstHandler;
