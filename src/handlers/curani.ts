// file: curani.ts
// todo:
// • cur -> ani
// • ani -> apng/gif

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

class curaniHandler implements FormatHandler {

    public name: string = "curani";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    async init () {
        this.supportedFormats = [
            {
                name: "Microsoft Windows ANI",
                format: "ani",
                extension: "ani",
                mime: "application/x-navi-animation",
                from: true,
                to: true,
                internal: "ani",
                category: "image",
                lossless: false,
            },
            {
                name: "Microsoft Windows CUR",
                format: "cur",
                extension: "cur",
                mime: "image/vnd.microsoft.cursor",
                from: true,
                to: true,
                internal: "cur",
                category: "image",
                lossless: false,
            },
            {
                name: "Microsoft Windows ICO",
                format: "ico",
                extension: "ico",
                mime: "image/vnd.microsoft.icon",
                from: true,
                to: true,
                internal: "ico",
                category: "image",
                lossless: false,
            }
        ];
        this.ready = true;
    }

    async doConvert (
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];

        for (const file of inputFiles) {
            let new_file_bytes = new Uint8Array(file.bytes);

            if (inputFormat.internal === "ani") {
                // Extract the first frame of the .ani
                if (outputFormat.internal === "cur") {
                    let header_hook = 0;
                    let i = 0;

                    // Finds where the first ICO header is
                    while (header_hook === 0) {
                        if (new_file_bytes[i] == 0x28 && new_file_bytes[i+1] == 0x0 && new_file_bytes[i+2] == 0x0 && new_file_bytes[i+3] == 0x0 && new_file_bytes[i+4] == 0x20 && new_file_bytes[i+5] == 0x0 && new_file_bytes[i+6] == 0x0 && new_file_bytes[i+7] == 0x0 && new_file_bytes[i+8] == 0x40) {
                            header_hook = i;
                        }
                        
                        if (i > new_file_bytes.length) {
                            throw new Error("Couldn't find ICO header, code gives up.");
                        }
                        i += 1;
                    }

                    // Gets the real start of the ICO
                    let ico_start = i-23;

                    // I don't think this magic 0x10BE number works for differently-sized .ani files....
                    new_file_bytes = new_file_bytes.subarray(ico_start,ico_start+0x10BE);
                }
                else if (outputFormat.internal === "ico") {
                    throw new Error("Refuse to convert from .ani directly to .ico; must use .cur as an intermediary.");
                }
                else {
                    throw new Error("Invalid output format.");
                }
            }
            else if (inputFormat.internal === "cur") {
                // Turn a static cur into a single-frame .ani
                if (outputFormat.internal === "ani") {
                    throw new Error("NEEDS TO BE IMPLEMENTED.");
                }
                // Convert a .cur into a .ico by removing hotspot and changing format header
                else if (outputFormat.internal === "ico") {
                    // 1 for ICO, 2 for CUR
                    new_file_bytes[2] = 1;

                    const images_present = new_file_bytes[4];
                    let counter = 0;

                    // Editing fields of all ICONDIRECTORYs
                    while (counter < images_present) {
                        // color planes
                        new_file_bytes[10+(counter*16)] = 1;
                        new_file_bytes[11+(counter*16)] = 0;
                        // bits per pixel
                        new_file_bytes[12+(counter*16)] = 0;
                        new_file_bytes[13+(counter*16)] = 0;
                        counter += 1;
                    }
                }
                else {
                    throw new Error("Invalid output format.");
                }
            }
            else if (inputFormat.internal === "ico") {
                if (outputFormat.internal === "ani") {
                    throw new Error("Refuse to convert from .ico directly to .ani; must use .cur as an intermediary.");
                }
                // Convert a .cur into a .ico by ADDING hotspot and changing format header
                else if (outputFormat.internal === "cur") {
                    // 1 for ICO, 2 for CUR
                    new_file_bytes[2] = 2;

                    const images_present = new_file_bytes[4];
                    let counter = 0;

                    // Editing fields of all ICONDIRECTORYs
                    while (counter < images_present) {
                        // color planes
                        new_file_bytes[10+(counter*16)] = 0;
                        new_file_bytes[11+(counter*16)] = 0;
                        // bits per pixel
                        new_file_bytes[12+(counter*16)] = 0;
                        new_file_bytes[13+(counter*16)] = 0;
                        counter += 1;
                    }
                }
                else {
                    throw new Error("Invalid output format.");
                }
            }
            else {
                throw new Error("Invalid input format.");
            }

            outputFiles.push({
                name: file.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension,
                bytes: new_file_bytes
            })
            return outputFiles;
        }
    }
}

export default curaniHandler;

