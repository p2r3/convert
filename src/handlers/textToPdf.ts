import { type FileData, type FileFormat, type FormatHandler } from "../FormatHandler.ts";
import Formats from "../Formats.ts";
import PDFDocument, { registerStdFonts } from "pdfkit";
import Courier from "pdfkit/standard-fonts/Courier";
import { changeExt, decode } from "src/common/index.ts";

class textToPdfHandler implements FormatHandler {
  public readonly name = "textToPdf";
  public supportedFormats = [Formats.TEXT.builder("text").from(), Formats.PDF.builder("pdf").to()];
  public ready = false;

  async init() {
    registerStdFonts(Courier);
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    for (const file of inputFiles) {
      const text = decode(file.bytes).replace(/\p{Extended_Pictographic}/gu, ""); // Remove emojis

      const doc = new PDFDocument({
        size: "A4",
        font: "Courier",
        margins: { top: 72, bottom: 72, left: 72, right: 72 },
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

        doc.font("Courier").fontSize(11).fillColor("#000000");
        doc.text(text.replace(/\r\n|\r/g, "\n"), {
          width: 595.28 - 72 - 72,
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
