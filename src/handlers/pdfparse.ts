// file: pdfparse.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import { PDFParse } from 'pdf-parse';


class pdfparseHandler implements FormatHandler {

  public name: string = "pdfparse";
  public supportedFormats?: FileFormat[] = [
    CommonFormats.PDF.builder("pdf").allowFrom(),
    CommonFormats.TEXT.builder("txt").allowTo(),
  ];
  public ready: boolean = false;

  async init () {
    PDFParse.setWorker('/convert/js/pdf.worker.mjs');
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const parser = new PDFParse({ data: inputFile.bytes });
      const text = await parser.getText();
      await parser.destroy();

      outputFiles.push({
        bytes: new TextEncoder().encode(text.text),
        name: inputFile.name.replace(/\.pdf$/i, ".txt"),
      });
    }

    return outputFiles;
  }

}

export default pdfparseHandler;