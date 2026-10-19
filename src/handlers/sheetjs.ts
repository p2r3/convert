import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt, decode, encode } from "src/common/index.ts";
import * as XLSX from "built/sheetjs/xlsx.mjs";

/** Converts between spreadsheet formats with SheetJS. */
class sheetjsHandler implements FormatHandler {
  public readonly name = "sheetjs";
  public supportedFormats = [
    Formats.XLSX.builder("xlsx").fromTo(),
    Formats.XLS.builder("biff8").fromTo(),
    Formats.ODS.builder("ods").fromTo(),
    Formats.CSV.builder("csv").fromTo(),
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
      // shortcut: without SheetJS's code page tables (built/sheetjs/dist/cpexcel.full.mjs, 470 KB),
      // so non-Western text in workbooks older than Excel 97 can come out wrong. Pass them to
      // XLSX.set_cptable when such files matter.
      const workbook =
        inputFormat.internal === "csv"
          ? // as text, because SheetJS would read the bytes of a CSV as Latin-1
            XLSX.read(decode(file.bytes), { type: "string" })
          : XLSX.read(file.bytes, { type: "array" });

      if (outputFormat.internal === "csv") {
        // a CSV holds one sheet, so a workbook with several becomes several files
        const several = workbook.SheetNames.length > 1;
        for (const sheet of workbook.SheetNames) {
          outputFiles.push({
            name: changeExt(file.name, "csv", several ? `-${sheet}` : ""),
            bytes: encode(XLSX.utils.sheet_to_csv(workbook.Sheets[sheet])),
          });
        }
        continue;
      }

      const bookType = outputFormat.internal as XLSX.BookType;
      outputFiles.push({
        name: changeExt(file.name, outputFormat.extension),
        bytes: new Uint8Array(XLSX.write(workbook, { bookType, type: "array" })),
      });
    }
    return outputFiles;
  }
}

export default sheetjsHandler;
