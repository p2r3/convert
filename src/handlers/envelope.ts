import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import { parseODT, parseODP, parseODS } from "./envelope/parseODF.js";
import parseDOCX from "./envelope/parseDOCX.js";
import parsePPTX from "./envelope/parsePPTX.js";
import parseXLSX from "./envelope/parseXLSX.js";
import CommonFormats from "src/CommonFormats.ts";

class envelopeHandler implements FormatHandler {

  public name: string = "envelope";

  public supportedFormats: FileFormat[] = [
    {
      name: "Microsoft Office 365 Word Document",
      format: "docx",
      extension: "docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      from: true,
      to: false,
      internal: "docx",
      category: "document"
    },
    {
      name: "Microsoft Office 365 Presentation",
      format: "pptx",
      extension: "pptx",
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      from: true,
      to: false,
      internal: "pptx",
      category: "presentation"
    },
    {
      name: "Microsoft Office 365 Workbook",
      format: "xlsx",
      extension: "xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      from: true,
      to: false,
      internal: "xlsx",
      category: "spreadsheet"
    },
    {
      name: "OpenDocument Text",
      format: "odt",
      extension: "odt",
      mime: "application/vnd.oasis.opendocument.text",
      from: true,
      to: false,
      internal: "odt",
      category: "document"
    },
    {
      name: "OpenDocument Presentation",
      format: "odp",
      extension: "odp",
      mime: "application/vnd.oasis.opendocument.presentation",
      from: true,
      to: false,
      internal: "odp",
      category: "presentation"
    },
    {
      name: "OpenDocument Spreadsheet",
      format: "ods",
      extension: "ods",
      mime: "application/vnd.oasis.opendocument.spreadsheet",
      from: true,
      to: false,
      internal: "ods",
      category: "spreadsheet"
    },
    CommonFormats.HTML.supported("html", false, true, true)
  ];

  public ready: boolean = true;

  async init () {
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    if (outputFormat.internal !== "html") throw "Invalid output format.";

    let parser: (bytes: Uint8Array) => Promise<string>;
    switch (inputFormat.internal) {
      case "odt": parser = parseODT; break;
      case "odp": parser = parseODP; break;
      case "ods": parser = parseODS; break;
      case "docx": parser = parseDOCX; break;
      case "pptx": parser = parsePPTX; break;
      case "xlsx": parser = parseXLSX; break;
      default: throw "Invalid input format.";
    }

    const outputFiles: FileData[] = [];

    const encoder = new TextEncoder();

    for (const inputFile of inputFiles) {
      const html = `<div style="background: #fff">
        ${await parser(inputFile.bytes)}
      </div>`;
      const bytes = encoder.encode(html);
      const baseName = inputFile.name.split(".")[0];
      const name = baseName + "." + outputFormat.extension;
      outputFiles.push({ bytes, name });
    }

    return outputFiles;

  }

}

export default envelopeHandler;
