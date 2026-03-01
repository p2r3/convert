import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { createTar, parseTar } from "nanotar";
import JSZip from "jszip";

class tarHandler implements FormatHandler {

  public name: string = "tar";

  public supportedFormats: FileFormat[] = [
    CommonFormats.TAR.builder("tar").allowFrom().allowTo().markLossless(),
    CommonFormats.ZIP.builder("zip").allowFrom().allowTo().markLossless()
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

    // TAR to ZIP
    if (inputFormat.internal === "tar" && outputFormat.internal === "zip") {
      const outputFiles: FileData[] = [];

      for (const inputFile of inputFiles) {
        const entries = parseTar(inputFile.bytes);

        const zip = new JSZip();
        for (const entry of entries) zip.file(entry.name, entry.data!);

        const zipData = await zip.generateAsync({ type: "uint8array" });
        const baseName = inputFile.name.replace(/\.tar$/i, "");
        outputFiles.push({ name: baseName + ".zip", bytes: zipData });
      }

      return outputFiles;
    }

    // ZIP to TAR
    if (inputFormat.internal === "zip" && outputFormat.internal === "tar") {
      const outputFiles: FileData[] = [];

      for (const inputFile of inputFiles) {
        const zip = await JSZip.loadAsync(inputFile.bytes);

        const entries: { name: string; data: Uint8Array }[] = [];
        for (const [filename, zipEntry] of Object.entries(zip.files)) {
          if (!zipEntry.dir) {
            entries.push({ name: filename, data: await zipEntry.async("uint8array") });
          }
        }

        const tarData = createTar(entries);
        const baseName = inputFile.name.replace(/\.zip$/i, "");
        outputFiles.push({ name: baseName + ".tar", bytes: new Uint8Array(tarData) });
      }

      return outputFiles;
    }

    // Any files to TAR
    if (outputFormat.internal === "tar") {
      const entries = inputFiles.map(f => ({ name: f.name, data: f.bytes }));
      return [{ name: "archive.tar", bytes: new Uint8Array(createTar(entries)) }];
    }

    throw new Error(`Unsupported conversion: ${inputFormat.format} to ${outputFormat.format}`);
  }
}

export default tarHandler;
