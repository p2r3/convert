// file: petozip.ts
// npm install pe-library jszip buffer

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import * as Pe from "pe-library"; 
import JSZip from "jszip";

import { Buffer } from "buffer";
if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
}

class peToZipHandler implements FormatHandler {

  public name: string = "petozip";

  public supportedFormats: FileFormat[] = [
    {
      name: "Windows Executable",
      format: "exe",
      extension: "exe",
      mime: "application/vnd.microsoft.portable-executable",
      from: true,
      to: false,
      internal: "exe"
    },
    {
      name: "Dynamic-Link Library",
      format: "dll",
      extension: "dll",
      mime: "application/vnd.microsoft.portable-executable",
      from: true,
      to: false,
      internal: "dll"
    },
    {
      name: "ZIP Archive",
      format: "zip",
      extension: "zip",
      mime: "application/zip",
      from: false,
      to: true,
      internal: "zip",
      category: "archive",
      lossless: true
    }
  ];

  public ready: boolean = true;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    if (outputFormat.format !== "zip") {
      throw new Error("Invalid output format. Only ZIP is supported.");
    }

    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      try {
        //initialize JSzip + buffer
        const zip = new JSZip();
        const buffer = Buffer.from(inputFile.bytes as Uint8Array);

        // Get metadata from PE headers
        //@ts-ignore
        const peFile = Pe.NtExecutable.from(buffer);
        const ntHeader = peFile.newHeader;
        
        const subsystemValue = ntHeader.optionalHeader.subsystem;
        const subsystemMap: Record<number, string> = {
          1: "Native",
          2: "Windows GUI",
          3: "Windows Console",
          7: "POSIX",
          9: "Windows CE",
          10: "EFI Application"
        };

        const metadata = {
          originalFileName: inputFile.name,
          architecture: peFile.is32bit() ? "x86 (32-bit)" : "x64 (64-bit)",
          compileTimestamp: new Date(ntHeader.fileHeader.timeDateStamp * 1000).toISOString(),
          subsystem: subsystemMap[subsystemValue] || `Unknown (${subsystemValue})`,
          imageBase: peFile.getImageBase(),
          sectionAlignment: peFile.getSectionAlignment(),
          imports: [] as any[],
          exports: [] as any[]
        };

        zip.file("metadata.json", JSON.stringify(metadata, null, 2));

        // Extract binary
        const allSections = peFile.getAllSections();

        for (const section of allSections) {
          const rawName = section.info.name.toString().replace(/\0/g, ''); 
          const safeName = rawName.replace(/[^a-zA-Z0-9]/g, '');
          const fileName = `section_${safeName || 'unnamed'}.bin`;
          
          if (section.data) {
            zip.file(fileName, section.data);
          }
        }
        
        // generate final ZIP
        const outputBytes = await zip.generateAsync({
          type: "uint8array",
          compression: "DEFLATE",
          compressionOptions: { level: 9 }
        });
        
        const baseName = inputFile.name.split(".")[0];
        const newName = `${baseName}_pe_data.zip`;

        outputFiles.push({
          bytes: outputBytes,
          name: newName
        });

      } catch (e: any) { // error handling
        console.error(`[petozip] Error converting ${inputFile.name}:`, e);
        throw new Error(`Failed to process PE file ${inputFile.name}: ${e.message}`);
      }
    }

    return outputFiles;
  }
}

export default peToZipHandler;