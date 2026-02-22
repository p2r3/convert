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
                mime: "image/vnd.microsoft.icon",
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
                    while (true) {
                        if (new_file_bytes[i] == 0x69 && new_file_bytes[i+1] == 0x63 && new_file_bytes[i+2] == 0x6F && new_file_bytes[i+3] == 0x6E && new_file_bytes[i+4] == 0xBE) {
                            header_hook = i;
                            break;
                        }

                        if (i > new_file_bytes.length) {
                            throw new Error("Couldn't find ICO header, code gives up.");
                        }
                        i += 1;
                    }

                    // Gets the real start of the ICO
                    const ico_start_offset = 8;
                    let ico_start = i+ico_start_offset;

                    // Finds the NEXT ICO header to determine file size
                    let ico_distance = 0x10BE;
                    let header_hook_2 = 0;
                    i = header_hook+1;
                    while (true) {
                        if (new_file_bytes[i] == 0x69 && new_file_bytes[i+1] == 0x63 && new_file_bytes[i+2] == 0x6F && new_file_bytes[i+3] == 0x6E && new_file_bytes[i+4] == 0xBE) {
                            header_hook_2 = i;
                            ico_distance = header_hook_2 - header_hook - ico_start_offset;
                            break;
                        }

                        if (i+5 > new_file_bytes.length) {
                            break;
                        }
                        i += 1;
                    }

                    new_file_bytes = new_file_bytes.subarray(ico_start,ico_start+ico_distance);
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
                    const ani_header = new Uint8Array([0x52,0x49,0x46,0x46,0xC8,0x21,0x00,0x00,0x41,0x43,0x4F,0x4E,0x61,0x6E,0x69,0x68,0x24,0x00,0x00,0x00,0x24,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0B,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x4C,0x49,0x00,0x54,0x90,0x21,0x00,0x00,0x66,0x72,0x61,0x6D,0x69,0x63,0x6F,0x6E,0xBE,0x10,0x00,0x00]);

                    let mergedArray = new Uint8Array(ani_header.length + new_file_bytes.length);
                    mergedArray.set(ani_header);
                    mergedArray.set(new_file_bytes, ani_header.length);

                    new_file_bytes = mergedArray;
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
        }
        return outputFiles;
    }
}

export default curaniHandler;

