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

export class comicsZipHandler implements FormatHandler {
    public name: string = "comicsZip";
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
                            throw new Error("Archive contains multiple file types; abort.");
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
            
            // Throw error if empty
            if (outputFiles.length === 0) {
                throw new Error("No applicable files to unzip found.");
            }
        }
        else {
            throw new Error("Invalid input-output.");
        }
        
        return outputFiles;
    }
}

export class comicsTarHandler implements FormatHandler {
    public name: string = "comicsTar";
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
                        throw new Error("Archive contains multiple file types; abort.");
                    }
                    else if (!file.data) {
                        throw new Error("Undefined data type; abort.");
                    }
                    else {
                        outputFiles.push({
                            name: file.name,
                            bytes: file.data
                        });
                    }
                }
            }
            
            // Throw error if empty
            if (outputFiles.length === 0) {
                throw new Error("No applicable files to unpack found.");
            }
        }
        else {
            throw new Error("Invalid input-output.");
        }
        
        return outputFiles;
    }
}
