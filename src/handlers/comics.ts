// file: comics.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import JSZip from "jszip";

const image_list = ["png","jpg","webp","bmp","tiff","gif"];

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
                name: "Comic Book Archive (ZIP)",
                format: "cbz",
                extension: "cbz",
                mime: "application/vnd.comicbook+zip",
                from: true,
                to: true,
                internal: "cbz",
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
        
        // Some code copied from wad.ts
        if ((image_list.includes(inputFormat.internal)) && (outputFormat.internal === "cbz" || outputFormat.internal === "zip")) {
            if (inputFormat.internal === "gif" && outputFormat.internal === "cbz" && inputFiles.length === 1) {
                throw new Error("User probably intends for a zip of video/gif frames; abort.");
            }
            
            const zip = new JSZip();
            
            // Determine the archive name
            const baseName = inputFiles[0].name.replace("_0."+inputFormat.extension,"."+inputFormat.extension).split(".").slice(0, -1).join(".");
        
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
        // Some code copied from lzh.ts
        else if ((inputFormat.internal === "cbz" || inputFormat.internal === "zip") && (image_list.includes(outputFormat.internal))) {
            for (const file of inputFiles) {
                const zip = new JSZip();
                await zip.loadAsync(file.bytes);

                // Extract all files from ZIP
                for (const [filename, zipEntry] of Object.entries(zip.files)) {
                    if (!zipEntry.dir) {
                        if (filename.endsWith(outputFormat.extension)) {
                            const data = await zipEntry.async("uint8array");
                            outputFiles.push({
                                name: filename,
                                bytes: data,
                            });
                        }
                        else if (inputFormat.internal === "cbz" && filename.endsWith(".xml")) {
                            // Do nothing. This is an exception to the rule.
                        }
                        else {
                            throw new Error("Archive contains multiple file types; abort.");
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

export default comicsHandler;