import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { TypstSnippet } from "@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs";

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
    const { $typst } = await import(
      "@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs"
    );

    $typst.setCompilerInitOptions({
      getModule: () =>
        `${import.meta.env.BASE_URL}wasm/typst_ts_web_compiler_bg.wasm`,
    });
    $typst.setRendererInitOptions({
      getModule: () =>
        `${import.meta.env.BASE_URL}wasm/typst_ts_renderer_bg.wasm`,
    });

    this.$typst = $typst;
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
      const mainContent = new TextDecoder().decode(file.bytes);
      const baseName = file.name.replace(/\.[^.]+$/u, "");

      if (outputFormat.internal === "pdf") {
        const pdfData = await this.$typst.pdf({ mainContent });
        if (!pdfData) throw new Error("Typst compilation to PDF failed.");
        outputFiles.push({
          name: `${baseName}.pdf`,
          bytes: new Uint8Array(pdfData),
        });
      } else if (outputFormat.internal === "svg") {
        const svgString = await this.$typst.svg({ mainContent });
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

