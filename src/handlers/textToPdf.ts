import { type FileData, type FileFormat, type FormatHandler } from "../FormatHandler.ts";
import Formats from "../Formats.ts";
import PDFDocument, { registerStdFonts } from "pdfkit";
import Courier from "pdfkit/standard-fonts/Courier";
import { changeExt, decode, ownedBytes } from "src/common/index.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import { numberOption, stringOption } from "src/Settings.ts";

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
    const pageSize = stringOption(options, "pageSize") ?? "A4";
    const fontSize = numberOption(options, "fontSize") ?? 11;
    const margin = numberOption(options, "margin") ?? 72;

    for (const file of inputFiles) {
      const text = decode(file.bytes).replace(/\p{Extended_Pictographic}/gu, ""); // Remove emojis

      const doc = new PDFDocument({
        size: pageSize,
        font: "Courier",
        margins: { top: margin, bottom: margin, left: margin, right: margin },
      });

      const pdfBytes = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
        const chunks: Uint8Array<ArrayBuffer>[] = [];

        doc.on("data", (chunk: Uint8Array) => chunks.push(ownedBytes(chunk)));
        doc.on("end", async () => {
          try {
            const bytes = await new Blob(chunks, {
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
