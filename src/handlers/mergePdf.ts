import type { FileData, FormatHandler } from "../FormatHandler.ts";
import { FormatDefinition } from "../FormatHandler.ts";
import Formats, { Category } from "src/Formats.ts";
import { Document, PDFDocument } from "mupdf";
import { changeExt } from "src/common/index.ts";

// its own format, so that picking it is a request to merge rather than a PDF to PDF no-op
const MERGED_PDF = new FormatDefinition(
  "Merged PDF (all selected PDFs in one file)",
  "pdf-merged",
  "pdf",
  "application/pdf",
  Category.DOCUMENT,
);

class mergePdfHandler implements FormatHandler {
  public readonly name = "mergePdf";
  public supportedFormats = [
    Formats.PDF.builder("pdf").from(),
    MERGED_PDF.builder("pdf").lossless().to(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(inputFiles: FileData[]): Promise<FileData[]> {
    const merged = new PDFDocument();
    for (const file of inputFiles) {
      const source = Document.openDocument(file.bytes, "application/pdf").asPDF();
      if (!source) throw new Error(`${file.name} is not a PDF.`);
      if (source.needsPassword()) throw new Error(`${file.name} is password protected.`);
      for (let i = 0; i < source.countPages(); i++) merged.graftPage(-1, source, i);
      source.destroy();
    }
    const bytes = new Uint8Array(merged.saveToBuffer("compress").asUint8Array());
    merged.destroy();
    return [{ name: changeExt(inputFiles[0].name, "pdf", "-merged"), bytes }];
  }
}

export default mergePdfHandler;
