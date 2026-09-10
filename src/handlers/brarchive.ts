// file: brarchive.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import JSZip from "jszip";

function read_lendian_4(a: number, b: number, c: number, d: number): number {
    return a + (b * Math.pow(16,2)) + (c * Math.pow(16,4)) + (d * Math.pow(16,6));
}

function write_lendian_4(x: number): number[] {
    if (x > 0xFFFFFFFF) {
        throw new Error("Error in write_lendian_4: number too big.");
    }
    if (x < 0x00) {
        throw new Error("Error in write_lendian_4: number is negative.");
    }

    let num_string : string = x.toString(16);
    
    while (num_string.length < 8) {
        num_string = "0"+num_string;
    }
    
    console.log("write_lendian_4: "+"("+x+")"+" ("+num_string+")");
    
    const array : number[] = [parseInt(num_string.substring(6,8),16),parseInt(num_string.substring(4,6),16),parseInt(num_string.substring(2,4),16),parseInt(num_string.substring(0,2),16)];
    console.log("write_lendian_4: "+array);
    return array
}

class BRARCHIVEHandler implements FormatHandler {
    public name: string = "brarchive";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;
    
    async init () {
        this.supportedFormats = [
            CommonFormats.ZIP.supported("zip", true, true, true),
            CommonFormats.JSON.supported("json", true, true, true),
            {
                name: "Minecraft Bedrock Archive",
                format: "brarchive",
                extension: "brarchive",
                mime: "image/x-brarchive",
                from: true,
                to: true,
                internal: "brarchive",
                category: Category.ARCHIVE,
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
        
        if (inputFormat.internal === "brarchive" && (outputFormat.internal === "zip" || outputFormat.internal === "json")) {
            // Thanks to @santiago046's documentation
            
            const file_entry_size = 1 + 247 + 4 + 4; // the size of a single FileEntry
        
            for (const file of inputFiles) {
                const decoder = new TextDecoder();
                const numEntries : number  = read_lendian_4(file.bytes[0x08],file.bytes[0x09],file.bytes[0x0A],file.bytes[0x0B]);
                
                // FileEntries begin at 0x10. Read them and store to an array we can look up later.
                let byte_cursor = 0x10;
                const FileEntries_info : string[][] = [];
                for (let i = 0; i < numEntries; i++) {
                    const file_name_length = file.bytes[byte_cursor];
                    byte_cursor++;
                    const file_name : string = decoder.decode(file.bytes.subarray(byte_cursor,byte_cursor+file_name_length));
                    byte_cursor += 247; // Names are stored as padded 247-length strings?? Weird but seems to be true.
                    const relative_offset : number = read_lendian_4(file.bytes[byte_cursor],file.bytes[byte_cursor+1],file.bytes[byte_cursor+2],file.bytes[byte_cursor+3]);
                    const absolute_offset : string  = (relative_offset + 16 + file_entry_size*numEntries).toString();
                    byte_cursor += 4;
                    const data_size : string = (read_lendian_4(file.bytes[byte_cursor],file.bytes[byte_cursor+1],file.bytes[byte_cursor+2],file.bytes[byte_cursor+3])).toString();
                    
                    if (data_size === "0") {
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
                        bytes: file.bytes.subarray(parseInt(FileEntries_info[i][1]),parseInt(FileEntries_info[i][1])+parseInt(FileEntries_info[i][2])),
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
                        if (!ar_file.name.endsWith(".json")) {
                            throw new Error("Error, brarchive doesn't consist solely of .json files, so we can't convert straight to that. "+ar_file.name);
                        }
                    }
                    
                    // Then we just add the files to the output.
                    outputFiles.push(...archiveFiles);
                }
            }
        }
        else if ((inputFormat.internal === "json" || inputFormat.internal === "zip") && outputFormat.internal === "brarchive") {
            const working_files: { [key: string]: FileData[] } = {};
            
            // Special handling for zip input.
            if (inputFormat.internal === "zip") {
                for (const file of inputFiles) {
                    const zip = new JSZip();
                    await zip.loadAsync(file.bytes);

                    let done_something_flag = false;

                    // Extract all files from ZIP
                    working_files[file.name] = [];
                    for (const [filename, zipEntry] of Object.entries(zip.files)) {
                        if (!zipEntry.dir) {
                            if (filename.endsWith(".json") === false) {
                                throw new Error("Archive contains more than just .json files; abort.");
                            }
                            else {
                                done_something_flag = true;
                                const data = await zipEntry.async("uint8array");
                                working_files[file.name].push({
                                    name: filename,
                                    bytes: data
                                });
                            }
                        }
                    }
                    
                    // Throw error if empty
                    if (!done_something_flag) {
                        throw new Error("No applicable files to unzip found in "+file.name);
                    }
                }
            }
            else {
                working_files["Unnamed.brarchive"] = [];
                working_files["Unnamed.brarchive"].push(...inputFiles);
            }
            
            // Iterate through each collection of files.
            for (const key in working_files) {
                // Unlikely, but handle it.
                if (working_files[key].length > 0xFFFFFFFF) {
                    throw new Error("Too many input files to encode in 4 bytes.");
                }
            
                // Zip all the inputs into one archive.
                const working_bytes : number[] = [];
                
                // Write headers and magic numbers.
                working_bytes.push(0x7D, 0x27, 0x25, 0xB1);
                working_bytes.push(0xA0, 0x52, 0x70, 0x26);
                working_bytes.push(...write_lendian_4(working_files[key].length));
                working_bytes.push(0x01, 0x00, 0x00, 0x00);
                
                // Start writing FileEntry's
                const encoder = new TextEncoder();
                for (let i = 0; i < working_files[key].length; i++) {
                    // Shorten name if need be
                    let name = working_files[key][i].name
                    while ((encoder.encode(name)).length > 247) {
                        name = name.substring(0,name.length-1);
                    }
                    
                    const name_bytes : Uint8Array = encoder.encode(name);
                    working_bytes.push(name_bytes.length);
                    
                    // Push name and padding
                    working_bytes.push(...name_bytes);
                    for (let pushed = name_bytes.length; pushed < 247; pushed++) {
                        working_bytes.push(0x00);
                    }
                    
                    // Relative offset is the sum of the file sizes of every file that comes before it.
                    let relative_offset = 0;
                    for (let i2 = i-1; i2 >= 0; i2--) {
                        relative_offset += working_files[key][i2].bytes.length;
                    }
                    working_bytes.push(...write_lendian_4(relative_offset));
                    
                    // Then, the file size of *this* file.
                    working_bytes.push(...write_lendian_4(working_files[key][i].bytes.length));
                }
                
                // FileEntry's are done. Write raw data.
                for (let i = 0; i < working_files[key].length; i++) {
                    working_bytes.push(...working_files[key][i].bytes);
                }
                
                // Finally, push our file.
                outputFiles.push({bytes: new Uint8Array(working_bytes), name: key.split(".").slice(0, -1).join(".") + "." + outputFormat.extension});
            }
        }
        else {
            throw new Error("Invalid input-output");
        }

        return outputFiles;
    }
}

export default BRARCHIVEHandler;