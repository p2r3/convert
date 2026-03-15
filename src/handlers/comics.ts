// file: comics.ts

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

const image_list = ["png","jpg","webp","bmp","tiff","gif"];
const archives_list = ["zip","cbz","tar","cbt"];

class comicsHandler implements FormatHandler {

    public name: string = "comics";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    async init () {
        this.supportedFormats = [
            CommonFormats.PNG.supported("png", true, true),
            CommonFormats.JPEG.supported("jpg", true, true),
            CommonFormats.WEBP.supported("webp", true, true),
            CommonFormats.BMP.supported("bmp", true, true),
            CommonFormats.TIFF.supported("tiff", true, true),
            CommonFormats.GIF.supported("gif", true, true),
            
            CommonFormats.ZIP.supported("zip", true, true),
            {
                name: "Tape Archive",
                format: "tar",
                extension: "tar",
                mime: "application/x-tar",
                from: true,
                to: true,
                internal: "tar",
                category: ["archive"],
            },
            
            {
                name: "Comic Book Archive (ZIP)",
                format: "cbz",
                extension: "cbz",
                mime: "application/vnd.comicbook+zip",
                from: true,
                to: true,
                internal: "cbz",
                category: ["archive"],
                lossless: true,
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
                lossless: true,
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
        
        // Base name for imgs -> archive
        const baseName = inputFiles[0].name.replace("_0."+inputFormat.extension,"."+inputFormat.extension).split(".").slice(0, -1).join(".");
        
        // Single-gif catching
        if (inputFormat.internal === "gif" && (archives_list.includes(outputFormat.internal)) && inputFiles.length === 1) {
            throw new Error("User probably intends for an archive of video/gif frames; abort.");
        }
        
        // Pack a zip/cbz with code copied from wad.ts
        if ((image_list.includes(inputFormat.internal)) && (outputFormat.internal === "cbz" || outputFormat.internal === "zip")) {
            const zip = new JSZip();
        
            // Add files to archive
            let iterations = 0;
            for (const file of inputFiles) {
                if (outputFormat.internal === "cbz") {
                    zip.file("Page "+String(iterations)+"."+inputFormat.extension, file.bytes);
                }
                else {
                    zip.file(file.name, file.bytes);
                }
                iterations += 1;
            }
            
            const output = await zip.generateAsync({ type: "uint8array" });
            outputFiles.push({ bytes: output, name: baseName + "." + outputFormat.extension });
        }
        // Unpack a zip/cbz with code copied from lzh.ts
        else if ((inputFormat.internal === "cbz" || inputFormat.internal === "zip") && (image_list.includes(outputFormat.internal))) {
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
        // Pack a cbt with code from tar.ts
        else if (image_list.includes(inputFormat.internal) && outputFormat.internal === "cbt") {
            const bytes = createTar(
                inputFiles.map(file => ({ name: "Page "+inputFiles.indexOf(file)+"."+inputFormat.extension, data: file.bytes })),
                {},
            );
            outputFiles.push({ bytes: bytes, name: baseName + "." + outputFormat.extension });
        }
        // Unpack a tar/cbt with code from tar.ts
        else if ((inputFormat.internal === "cbt" || inputFormat.internal === "tar") && image_list.includes(outputFormat.internal)) {
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
        // Renaming interchangeable formats. Note that any valid "comic book" archive can be guaranteed as a valid standard archive, but not every valid archive can be a valid comic book archive. Thus, we only allow renaming from comic book to non-comic book formats.
        else if ((inputFormat.internal === "cbz" && outputFormat.internal === "zip") || (inputFormat.internal === "cbt" && outputFormat.internal === "tar")) {
            for (const file of inputFiles) {
                outputFiles.push({ bytes: file.bytes, name: file.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension });
            }
        }
        else {
            throw new Error("Invalid input-output.");
        }
        
        return outputFiles;
    }
}

export default comicsHandler;
