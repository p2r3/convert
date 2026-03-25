import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { TypstSnippet } from "@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs";
import { MemoryAccessModel } from "@myriaddreamin/typst.ts/fs/memory";
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

class TypstHandler implements FormatHandler {
  public name: string = "typst";
  public ready: boolean = false;

  public supportedFormats: FileFormat[] = [
    CommonFormats.TYPST.supported("typst", true, false, true),
    CommonFormats.PDF.supported("pdf", false, true),
    CommonFormats.SVG.supported("svg", false, true),
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

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (!this.ready || !this.$typst) throw new Error("Handler not initialized.");

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
