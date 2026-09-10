import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { TypstSnippet } from "@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs";
import { MemoryAccessModel } from "@myriaddreamin/typst.ts/fs/memory";
import {
  TYPST_ASSET_MANIFEST_END,
  TYPST_ASSET_MANIFEST_START,
} from "./pandoc.ts";
import { BadMagicError, EOFError, InitializationError } from "src/errors.ts";

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
