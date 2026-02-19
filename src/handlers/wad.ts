import { FormatDefinition } from "../FormatHandler.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import JSZip from "jszip";

const WADFormat = new FormatDefinition(
    "Doom WAD Archive",
    "wad",
    "wad",
    "application/x-doom-wad",
    "archive"
);

interface WadLump {
    name: string;
    data: Uint8Array;
}

interface ParsedWAD {
    type: string;
    lumps: WadLump[];
}

class wadHandler implements FormatHandler {

    public name: string = "wad";
    public ready: boolean = true;

    public supportedFormats: FileFormat[] = [
        WADFormat.builder("wad").allowFrom().allowTo().markLossless(),
        CommonFormats.ZIP.builder("zip").allowFrom().allowTo(),
        CommonFormats.JSON.builder("json").allowTo()
    ];

    async init() {
        this.ready = true;
    }

    private parseWAD(bytes: Uint8Array): ParsedWAD {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
        if (magic !== "IWAD" && magic !== "PWAD") {
            throw new Error("Not a valid WAD file (missing IWAD/PWAD header)");
        }
        const numLumps = view.getInt32(4, true);
        const dirOffset = view.getInt32(8, true);
        const lumps: WadLump[] = [];
        for (let i = 0; i < numLumps; i++) {
            const entryOffset = dirOffset + i * 16;
            const lumpOffset = view.getInt32(entryOffset, true);
            const lumpSize = view.getInt32(entryOffset + 4, true);
            // Lump name: 8 bytes, null-padded
            let lumpName = "";
            for (let j = 0; j < 8; j++) {
                const c = bytes[entryOffset + 8 + j];
                if (c === 0) break;
                lumpName += String.fromCharCode(c);
            }
            const data = lumpSize > 0
                ? new Uint8Array(bytes.buffer, bytes.byteOffset + lumpOffset, lumpSize)
                : new Uint8Array(0);
            // Clone to avoid mutating the source buffer
            lumps.push({ name: lumpName, data: new Uint8Array(data) });
        }
        return { type: magic, lumps };
    }

    private buildWAD(lumps: WadLump[]): Uint8Array {
        const headerSize = 12;
        let dataSize = 0;
        for (const lump of lumps) dataSize += lump.data.length;
        const dirSize = lumps.length * 16;
        const total = headerSize + dataSize + dirSize;

        const buffer = new Uint8Array(total);
        const view = new DataView(buffer.buffer);

        // Write "PWAD" magic
        buffer[0] = 0x50; buffer[1] = 0x57; buffer[2] = 0x41; buffer[3] = 0x44;
        view.setInt32(4, lumps.length, true);
        view.setInt32(8, headerSize + dataSize, true); // directory offset

        // Write lump data and collect offsets
        const lumpOffsets: number[] = [];
        let offset = headerSize;
        for (const lump of lumps) {
            lumpOffsets.push(offset);
            buffer.set(lump.data, offset);
            offset += lump.data.length;
        }

        // Write directory
        let dirPos = headerSize + dataSize;
        const encoder = new TextEncoder();
        for (let i = 0; i < lumps.length; i++) {
            view.setInt32(dirPos, lumpOffsets[i], true);
            view.setInt32(dirPos + 4, lumps[i].data.length, true);
            // Lump name: 8 bytes, null-padded, uppercase
            const nameBytes = encoder.encode(lumps[i].name.substring(0, 8).toUpperCase());
            buffer.set(nameBytes, dirPos + 8);
            dirPos += 16;
        }

        return buffer;
    }

    async doConvert(
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];

        if (inputFormat.internal === "wad") {
            for (const file of inputFiles) {
                const { type, lumps } = this.parseWAD(file.bytes);
                const baseName = file.name.replace(/\.wad$/i, "");

                if (outputFormat.internal === "zip") {
                    // WAD → ZIP: each lump becomes a file
                    const zip = new JSZip();
                    const nameCounts: Record<string, number> = {};
                    for (const lump of lumps) {
                        let zipName = lump.name || "UNNAMED";
                        // Deduplicate names
                        if (nameCounts[zipName] !== undefined) {
                            nameCounts[zipName]++;
                            zipName = `${zipName}_${nameCounts[zipName]}`;
                        } else {
                            nameCounts[zipName] = 0;
                        }
                        zip.file(zipName, lump.data);
                    }
                    const output = await zip.generateAsync({ type: "uint8array" });
                    outputFiles.push({ bytes: output, name: baseName + ".zip" });

                } else if (outputFormat.internal === "json") {
                    // WAD → JSON: export directory listing and metadata
                    const info = {
                        type,
                        lumpCount: lumps.length,
                        lumps: lumps.map((l, i) => ({
                            index: i,
                            name: l.name,
                            size: l.data.length
                        }))
                    };
                    outputFiles.push({
                        bytes: new TextEncoder().encode(JSON.stringify(info, null, 2)),
                        name: baseName + ".json"
                    });

                } else if (outputFormat.internal === "wad") {
                    // WAD → WAD (passthrough / normalize to PWAD)
                    const rebuilt = this.buildWAD(lumps);
                    outputFiles.push({ bytes: rebuilt, name: baseName + ".wad" });
                }
            }

        } else if (inputFormat.internal === "zip") {
            // ZIP → WAD: each zip entry becomes a lump
            for (const file of inputFiles) {
                const baseName = file.name.replace(/\.zip$/i, "");
                const zip = await JSZip.loadAsync(file.bytes);
                const lumps: WadLump[] = [];

                const sortedPaths = Object.keys(zip.files).sort();
                for (const filePath of sortedPaths) {
                    const entry = zip.files[filePath];
                    if (entry.dir) continue;
                    const data = await entry.async("uint8array");
                    // Use filename without extension as lump name (max 8 chars, uppercase)
                    const lumpName = filePath.split("/").pop()!
                        .replace(/\.[^.]*$/, "")
                        .substring(0, 8)
                        .toUpperCase();
                    lumps.push({ name: lumpName, data });
                }

                const wadBytes = this.buildWAD(lumps);
                outputFiles.push({ bytes: wadBytes, name: baseName + ".wad" });
            }
        }

        return outputFiles;
    }

}

export default wadHandler;
