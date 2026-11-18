import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import { parseODT, parseODP, parseODS } from "built/envelope/parseODF.js";
import parseDOCX from "built/envelope/parseDOCX.js";
import parsePPTX from "built/envelope/parsePPTX.js";
import parseXLSX from "built/envelope/parseXLSX.js";
import Formats from "src/Formats.ts";
import { changeExt, encode } from "src/common/index.ts";

class envelopeHandler implements FormatHandler {
  public readonly name = "envelope";
  public supportedFormats = [
    Formats.DOCX.builder("docx").from(),
    // Currently, Pancoc handles PPTX and XLSX better than Envelope.
    // Formats.PPTX.builder("pptx").from(),
    // Formats.XLSX.builder("xlsx").from(),
    Formats.ODT.builder("odt").from(),
    Formats.ODP.builder("odp").from(),
    Formats.ODS.builder("ods").from(),
    // Technically not "lossless", but it's about as close as we'll ever get
    Formats.HTML.builder("html").lossless().to(),
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
    if (outputFormat.internal !== "html")
      throw new TypeError(`Unsupported output format: ${outputFormat.internal}`);

    let parser: (bytes: Uint8Array) => Promise<string>;
    switch (inputFormat.internal) {
      case "odt":
        parser = parseODT;
        break;
      case "odp":
        parser = parseODP;
        break;
      case "ods":
        parser = parseODS;
        break;
      case "docx":
        parser = parseDOCX;
        break;
      case "pptx":
        parser = parsePPTX;
        break;
      case "xlsx":
        parser = parseXLSX;
        break;
      default:
        throw new TypeError(`Unsupported input format: ${inputFormat.internal}`);
    }

    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const html = `<meta charset="utf-8"><div style="background: #fff">
        ${await parser(inputFile.bytes)}
      </div>`;
      const bytes = encode(html);
      const name = changeExt(inputFile.name, outputFormat.extension);
      outputFiles.push({ bytes, name });
    }

    return outputFiles;
  }
}

export default envelopeHandler;
