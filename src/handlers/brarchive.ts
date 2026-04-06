// file: brarchive.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import JSZip from "jszip";

function read_lendian_4(a: number, b: number, c: number, d: number): number {
    return a + (b * Math.pow(16,2)) + (c * Math.pow(16,4)) + (d * Math.pow(16,6));
}

class BRARCHIVEHandler implements FormatHandler {
    public name: string = "brarchive";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;
    
    async init () {
        this.supportedFormats = [
            CommonFormats.ZIP.supported("zip", false, true, true),
            CommonFormats.JSON.supported("json", false, true, true),
            {
                name: "BRARCHIVE - Minecraft Bedrock Archive",
                format: "brarchive",
                extension: "brarchive",
                mime: "image/x-brarchive",
                from: true,
                to: false,
                internal: "brarchive",
                category: Category.DATA,
                lossless: false
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
        
        if (inputFormat.internal === "brarchive" && (outputFormat.internal === "zip" || outputFormat.internal === "json")) {
            // Thanks to @santiago046's documentation
            
            const file_entry_size = 1 + 247 + 4 + 4; // the size of a single FileEntry
        
            for (const file of inputFiles) {
                const decoder = new TextDecoder();
                const numEntries = read_lendian_4(file.bytes[0x08],file.bytes[0x09],file.bytes[0x0A],file.bytes[0x0B]);
                
                // FileEntries begin at 0x10. Read them and store to an array we can look up later.
                let byte_cursor = 0x10;
                const FileEntries_info = [];
                for (let i = 0; i < numEntries; i++) {
                    const file_name_length = file.bytes[byte_cursor];
                    byte_cursor++;
                    const file_name = decoder.decode(file.bytes.subarray(byte_cursor,byte_cursor+file_name_length));
                    byte_cursor += 247; // Names are stored as padded 247-length strings?? Weird but seems to be true.
                    const relative_offset = read_lendian_4(file.bytes[byte_cursor],file.bytes[byte_cursor+1],file.bytes[byte_cursor+2],file.bytes[byte_cursor+3]);
                    const absolute_offset = relative_offset + 16 + file_entry_size*numEntries;
                    byte_cursor += 4;
                    const data_size = read_lendian_4(file.bytes[byte_cursor],file.bytes[byte_cursor+1],file.bytes[byte_cursor+2],file.bytes[byte_cursor+3]);
                    
                    if (data_size === 0) {
                        throw new Error("Error, file has no data. Can't meaningfully convert.");
                    }
                    
                    // Finally, store that information in the array
                    FileEntries_info.push([file_name,absolute_offset,data_size]);
                    
                    // Jump byte_cursor one more time so we start the next loop at the next entry.
                    byte_cursor += 4;
                }
                
                // We now have the information we need. Begin pushing the files to a FileData array.
                const archiveFiles: FileData[] = [];
                
                for (let i = 0; i < FileEntries_info.length; i++) {
                    archiveFiles.push({
                        name: FileEntries_info[i][0],
                        bytes: file.bytes.subarray(FileEntries_info[i][1],FileEntries_info[i][1]+FileEntries_info[i][2]),
                    });
                }
                
                if (outputFormat.internal === "zip") {
                    // And now, we simply zip the files!
                    const zip = new JSZip();
                    for (const ar_file of archiveFiles) {
                        zip.file(ar_file.name, ar_file.bytes);
                    }
                    
                    // Finally, output the zip.
                    const output = await zip.generateAsync({ type: "uint8array" });
                    outputFiles.push({ bytes: output, name: file.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension });
                }
                else if (outputFormat.internal === "json") {
                    // First, validate that everything in the archive is in fact a .json file.
                    for (const ar_file of archiveFiles) {
                        if (ar_file.name.endsWith(".json")) {
                            throw new Error("Error, brarchive doesn't consist solely of .json files, so we can't convert straight to that.");
                        }
                    }
                    
                    // Then we just add the files to the output.
                    outputFiles.push(...archiveFiles);
                }
            }
        }
        else {
            throw new Error("Invalid input-output");
        }

        return outputFiles;
    }
}

export default BRARCHIVEHandler;