// file: comics.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";

import {
  createTar,
  createTarGzip,
  createTarGzipStream,
  parseTar,
  parseTarGzip,
  type TarFileItem,
} from "nanotar";
import JSZip from "jszip";

const image_list = ["png","jpg","webp","bmp","tiff","gif"];

function padNumberString(num: number, digits: number): string {
  let str = String(num);

  while (str.length < digits) {
    str = "0"+str;
  }

  return str;
}

export class comicsZipPackerHandler implements FormatHandler {
    public name: string = "comicsZipPacker";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    async init () {
        this.supportedFormats = [
            CommonFormats.PNG.supported("png", true, false),
            CommonFormats.JPEG.supported("jpg", true, false),
            CommonFormats.WEBP.supported("webp", true, false),
            CommonFormats.BMP.supported("bmp", true, false),
            CommonFormats.TIFF.supported("tiff", true, false),
            CommonFormats.GIF.supported("gif", true, false),

            CommonFormats.ZIP.supported("zip", false, true, true),
            {
                name: "Comic Book Archive (ZIP)",
                format: "cbz",
                extension: "cbz",
                mime: "application/vnd.comicbook+zip",
                from: false,
                to: true,
                internal: "cbz",
                category: Category.ARCHIVE,
                lossless: false,
            },
        ];

        this.ready = true;
    }

    async doConvert (
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];

        // Pack a zip/cbz with code copied from wad.ts
        if ((image_list.includes(inputFormat.internal)) && (outputFormat.internal === "cbz" || outputFormat.internal === "zip")) {
            // Single-gif catching
            if (inputFormat.internal === "gif" && inputFiles.length === 1) {
                throw new TypeError("User probably intends for an archive of video/gif frames; abort.");
            }

            // Base name for imgs -> archive
            const baseName = inputFiles[0].name.replace("_0."+inputFormat.extension,"."+inputFormat.extension).split(".").slice(0, -1).join(".");

            const zip = new JSZip();

            // Add files to archive
            const necessaryDigits = String(inputFiles.length-1).length;
            let iterations = 0;
            for (const file of inputFiles) {
                if (outputFormat.internal === "cbz") {
                    zip.file(padNumberString(iterations,necessaryDigits)+"."+inputFormat.extension, file.bytes);
                }
                else {
                    zip.file(file.name, file.bytes);
                }
                iterations += 1;
            }

            const output = await zip.generateAsync({ type: "uint8array" });
            outputFiles.push({ bytes: output, name: baseName + "." + outputFormat.extension });
        }
        else {
            throw new TypeError(`Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`);
        }

        return outputFiles;
    }
}

export class comicsZipUnpackerHandler implements FormatHandler {
    public name: string = "comicsZipUnpacker";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    async init () {
        this.supportedFormats = [
            CommonFormats.PNG.supported("png", false, true),
            CommonFormats.JPEG.supported("jpg", false, true),
            CommonFormats.WEBP.supported("webp", false, true),
            CommonFormats.BMP.supported("bmp", false, true),
            CommonFormats.TIFF.supported("tiff", false, true),
            CommonFormats.GIF.supported("gif", false, true),

            CommonFormats.ZIP.supported("zip", true, false),
            {
                name: "Comic Book Archive (ZIP)",
                format: "cbz",
                extension: "cbz",
                mime: "application/vnd.comicbook+zip",
                from: true,
                to: false,
                internal: "cbz",
                category: Category.ARCHIVE,
                lossless: false,
            },
        ];

        this.ready = true;
    }

    async doConvert (
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];

        // Unpack a zip/cbz with code copied from lzh.ts
        if ((inputFormat.internal === "cbz" || inputFormat.internal === "zip") && (image_list.includes(outputFormat.internal))) {
            for (const file of inputFiles) {
                const zip = new JSZip();
                await zip.loadAsync(file.bytes);

                // Extract all files from ZIP
                for (const [filename, zipEntry] of Object.entries(zip.files)) {
                    if (!zipEntry.dir) {
                        if (inputFormat.internal === "cbz" && filename.endsWith(".xml")) {
                            // Ignore .xml files in comic book archives.
                        }
                        else if (filename.endsWith("."+outputFormat.extension) === false) {
                            throw new TypeError("Archive contains multiple file types; abort.");
                        }
                        else {
                            const data = await zipEntry.async("uint8array");
                            outputFiles.push({
                                name: filename,
                                bytes: data
                            });
                        }
                    }
                }
            }

            // throw new Error if empty
            if (outputFiles.length === 0) {
                throw new Error("No applicable files to unzip found.");
            }
        }
        else {
            throw new TypeError(`Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`);
        }

        return outputFiles;
    }
}

export class comicsTarUnpackerHandler implements FormatHandler {
    public name: string = "comicsTarUnpacker";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    async init () {
        this.supportedFormats = [
            CommonFormats.PNG.supported("png", false, true),
            CommonFormats.JPEG.supported("jpg", false, true),
            CommonFormats.WEBP.supported("webp", false, true),
            CommonFormats.BMP.supported("bmp", false, true),
            CommonFormats.TIFF.supported("tiff", false, true),
            CommonFormats.GIF.supported("gif", false, true),

            CommonFormats.TAR.supported("tar", true, false),
            {
                name: "Comic Book Archive (TAR)",
                format: "cbt",
                extension: "cbt",
                mime: "application/vnd.comicbook+tar",
                from: true,
                to: false,
                internal: "cbt",
                category: Category.ARCHIVE,
                lossless: false,
            },
        ];

        this.ready = true;
    }

    async doConvert (
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];

        // Unpack a tar/cbt with code from tar.ts
        if ((inputFormat.internal === "cbt" || inputFormat.internal === "tar") && image_list.includes(outputFormat.internal)) {
            for (const inputFile of inputFiles) {
                const files = parseTar(inputFile.bytes);

                for (const file of files) {
                    if (inputFormat.internal === "cbt" && file.name.endsWith(".xml")) {
                        // Ignore .xml files in comic book archives.
                    }
                    else if (file.name.endsWith("."+outputFormat.extension) === false) {
                        throw new TypeError("Archive contains multiple file types; abort.");
                    }
                    else if (!file.data) {
                        throw new TypeError("Undefined data type; abort.");
                    }
                    else {
                        outputFiles.push({
                            name: file.name,
                            bytes: file.data
                        });
                    }
                }
            }

            // throw new Error if empty
            if (outputFiles.length === 0) {
                throw new Error("No applicable files to unpack found.");
            }
        }
        else {
            throw new TypeError(`Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`);
        }

        return outputFiles;
    }
}
