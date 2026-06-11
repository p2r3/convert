import { type FileData, type FileFormat, type FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "../CommonFormats.ts";
import PDFDocument from "pdfkit/js/pdfkit.standalone";

class textToPdfHandler implements FormatHandler {
  public name = "text-to-pdf";
  public supportedFormats?: FileFormat[] = [
      CommonFormats.TEXT.builder("text").allowFrom(true).allowTo(false),
      CommonFormats.PDF.builder("pdf").allowFrom(false).allowTo(true).markLossless(),
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

    for (const file of inputFiles) {
      const rawText = new TextDecoder().decode(file.bytes);
      const hasLetters = /\p{L}/u.test(rawText);
      const hasEmojis = /\p{Emoji}/u.test(rawText);
      if (hasEmojis && !hasLetters) {
        throw `Input file "${file.name}" does not contain any letters, only emojis.`;
      }
      let text = rawText;
      if (hasEmojis) {
        text = rawText.replace(/\p{Emoji}/gu, " "); // Remove emojis
      }

      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 72, bottom: 72, left: 72, right: 72 },
      });

      const pdfBytes = await new Promise<Uint8Array>((resolve, reject) => {
        const chunks: Uint8Array[] = [];

        doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
        doc.on("end", async () => {
          try {
            const buffer = await new Blob(chunks as BlobPart[], { type: "application/pdf" }).arrayBuffer();
            resolve(new Uint8Array(buffer));
          } catch (error) {
            reject(error);
          }
        });

        doc.on("error", reject);

        doc.font("Courier").fontSize(11).fillColor("#000000");
        doc.text(text.replace(/\r\n|\r/g, '\n'), {
          width: 595.28 - 72 - 72,
          align: "left",
        });

        doc.end();
      });

      const basename = file.name.split(".").slice(0, -1).join(".") || "document";
      outputFiles.push({
        name: `${basename}.${outputFormat.extension}`,
        bytes: pdfBytes,
      });
    }

    return outputFiles;
  }
}

export default textToPdfHandler;
