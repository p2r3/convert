// file: tar.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

import {
  createTar,
  createTarGzip,
  createTarGzipStream,
  parseTar,
  parseTarGzip,
  type TarFileItem,
} from "nanotar";
import JSZip from "jszip";

class tarHandler implements FormatHandler {

  public name: string = "tar";
  public supportedFormats?: FileFormat[] = [
    {
      name: "Tape Archive",
      format: "tar",
      extension: "tar",
      mime: "application/x-tar",
      from: true,
      to: true,
      internal: "tar",
      category: ["archive"],
      lossless: true
    },
    CommonFormats.ZIP.builder("zip").allowFrom().allowTo().markLossless(),
    
    {
      name: "Comic Book Archive (ZIP)",
      format: "cbz",
      extension: "cbz",
      mime: "application/vnd.comicbook+zip",
      from: true,
      to: true,
      internal: "cbz",
      category: ["archive"],
    },
    {
      name: "Comic Book Archive (TAR)",
      format: "cbt",
      extension: "cbt",
      mime: "application/vnd.comicbook+tar",
      from: true,
      to: true,
      internal: "cbt",
      category: ["archive"],
    },
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

    if ((inputFormat.internal === "zip" && outputFormat.internal === "tar") || (inputFormat.internal === "cbz" && outputFormat.internal === "cbt")) {
      for (const inputFile of inputFiles) {
        const zip = new JSZip();
        await zip.loadAsync(inputFile.bytes);

        const archiveFiles: TarFileItem[] = [];

        for (const [filename, zipEntry] of Object.entries(zip.files)) {
          if (zipEntry.dir) {
            archiveFiles.push({ name: filename });
            continue;
          }
          const data = await zipEntry.async("uint8array");

          archiveFiles.push({
            name: filename,
            data,
            attrs: {
              mtime: zipEntry.date.getTime(),
              mode: zipEntry.unixPermissions?.toString(8)
            }
          });
        }

        const name = inputFile.name.replace(/\.zip$/i, ".tar").replace(/\.cbz$/i, ".cbt");
        const bytes = createTar(
          archiveFiles,
          {},
        );

        outputFiles.push({ bytes, name });
      }
    } else if ((inputFormat.internal === "tar" && outputFormat.internal === "zip") || (inputFormat.internal === "cbt" && outputFormat.internal === "cbz")) {
      for (const inputFile of inputFiles) {
        const files = parseTar(inputFile.bytes);

        const zip = new JSZip();

        for (const file of files) {
          const date = file.attrs?.mtime ? new Date(file.attrs?.mtime * 1000) : undefined;
          const unixPermissions = file.attrs?.mode;

          if (!file.data) {
            zip.file(file.name, null, { dir: true, date, unixPermissions });
          } else {
            zip.file(file.name, file.data, { date, unixPermissions });
          }
        }

        const bytes = await zip.generateAsync({ type: "uint8array" });

        const name = inputFile.name.replace(/\.tar$/i, ".zip").replace(/\.cbt$/i, ".cbz");
        outputFiles.push({ bytes, name });
      }
    } else if (outputFormat.internal === "tar") {
      const bytes = createTar(
        inputFiles.map(file => ({ name: file.name, data: file.bytes })),
        {},
      );
      const name = inputFiles.length == 1 ? inputFiles[0].name + ".tar" : "archive.tar";
      outputFiles.push({ bytes, name })
    } else {
      throw "tarHandler cannot process this conversion";
    }

    return outputFiles;
  }

}

export default tarHandler;