import { type FileData, type FileFormat, type FormatHandler } from "../FormatHandler.ts";
import Formats from "../Formats.ts";
import PDFDocument, { registerStdFonts } from "pdfkit";
import Courier from "pdfkit/standard-fonts/Courier";
import { changeExt, decode } from "src/common/index.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";

const PAGE_SIZES = ["A3", "A4", "A5", "LETTER", "LEGAL"];

class textToPdfHandler implements FormatHandler {
  public readonly name = "textToPdf";
  public supportedFormats = [
    Formats.TEXT.builder("text").from(),
    Formats.PDF.builder("pdf")
      .options({
        pageSize: { type: "enum", label: "Page size", values: PAGE_SIZES },
        fontSize: { type: "number", label: "Font size", unit: "pt", min: 1, max: 200 },
        margin: { type: "number", label: "Margin", unit: "pt", min: 0, max: 144 },
      })
      .to(),
  ];
  public ready = false;

  async init() {
    registerStdFonts(Courier);
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    const options = ctx?.options ?? {};
    const pageSize = (options.pageSize as string | undefined) ?? "A4";
    const fontSize = (options.fontSize as number | undefined) ?? 11;
    const margin = (options.margin as number | undefined) ?? 72;

    for (const file of inputFiles) {
      const text = decode(file.bytes).replace(/\p{Extended_Pictographic}/gu, ""); // Remove emojis

      const doc = new PDFDocument({
        size: pageSize,
        font: "Courier",
        margins: { top: margin, bottom: margin, left: margin, right: margin },
      });

      const pdfBytes = await new Promise<Uint8Array>((resolve, reject) => {
        const chunks: Uint8Array[] = [];

        doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
        doc.on("end", async () => {
          try {
            const bytes = await new Blob(chunks as BlobPart[], {
              type: "application/pdf",
            }).bytes();
            resolve(bytes);
          } catch (error) {
            reject(error);
          }
        });

        doc.on("error", reject);

        doc.font("Courier").fontSize(fontSize).fillColor("#000000");
        doc.text(text.replace(/\r\n|\r/g, "\n"), {
          width: doc.page.width - margin * 2,
          align: "left",
        });

        doc.end();
      });

      outputFiles.push({
        name: changeExt(file.name, outputFormat.extension),
        bytes: pdfBytes,
      });
    }

    return outputFiles;
  }
}

export default textToPdfHandler;
