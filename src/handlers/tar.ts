import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { createTar, parseTar } from "nanotar";
import JSZip from "jszip";

class tarHandler implements FormatHandler {

  public name: string = "tar";

  public supportedFormats: FileFormat[] = [
    {
      name: "Tape Archive",
      format: "tar",
      extension: "tar",
      mime: "application/x-tar",
      from: true,
      to: true,
      internal: "tar",
      category: "archive",
      lossless: true
    },
    CommonFormats.ZIP.builder("zip").allowFrom().allowTo().markLossless()
  ];

  public supportAnyInput: boolean = true;

  public ready: boolean = false;

  async init() {
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {

      // TAR to ZIP
      if (inputFormat.internal === "tar" && outputFormat.internal === "zip") {
        const entries = parseTar(inputFile.bytes);

        const zip = new JSZip();
        for (const entry of entries) zip.file(entry.name, entry.data!);

        const zipData = await zip.generateAsync({ type: "uint8array" });
        const baseName = inputFile.name.replace(/\.tar$/i, "");
        outputFiles.push({ name: baseName + ".zip", bytes: zipData });

      // ZIP to TAR
      } else if (inputFormat.internal === "zip" && outputFormat.internal === "tar") {
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

      // Any files to TAR
      } else if (outputFormat.internal === "tar") {
        const entries = inputFiles.map(f => ({ name: f.name, data: f.bytes }));
        outputFiles.push({ name: "archive.tar", bytes: new Uint8Array(createTar(entries)) });
        break;

      } else {
        throw "Unsupported conversion.";
      }

    }

    return outputFiles;
  }
}

export default tarHandler;
