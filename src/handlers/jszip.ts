import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import normalizeMimeType from "../normalizeMimeType.js";
import mime from "mime";
import JSZip from "jszip";
import type { JSZipObject } from "jszip";

class jszipHandler implements FormatHandler {

  public name: string = "jszip";

  public supportedFormats: FileFormat[] = [
    {
      name: "ZIP Archive",
      format: "zip",
      extension: "zip",
      mime: "application/zip",
      from: true,
      to: true,
      internal: "zip"
    },
    {
      name: "Portable Network Graphics",
      format: "png",
      extension: "png",
      mime: "image/png",
      from: false,
      to: true,
      internal: "png"
    }
  ];

  public supportAnyInput: boolean = true;

  public ready: boolean = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    const outputFiles: FileData[] = [];
    const zip = new JSZip();
    
    if (outputFormat.format == "zip") {

      for (const file of inputFiles) {
        zip.file(file.name, file.bytes);
      }

      const output = await zip.generateAsync({ type: "uint8array" });
      outputFiles.push({ bytes: output, name: "output.zip" });
    } else if (outputFormat.format == "png") {
      
      for (const file of inputFiles) {
        const zipData = await zip.loadAsync(file.bytes);

        for (const [relativePath, entry] of Object.entries<JSZipObject>(zipData.files)) {
          // Skip directories
          if (entry.dir) continue;

          // Get file blob
          const fileBlob : Blob = await entry.async('blob');
          let mimeType = mime.getType(entry.name);
          console.log(mimeType);

          // Only export files of specified type
          if (mimeType == outputFormat.mime) {
            const fileBytes = await fileBlob.bytes();
            outputFiles.push({ bytes: fileBytes, name: "output.png" });
          }
        
        }
      }
    }

    return outputFiles;
  }
}

export default jszipHandler;
