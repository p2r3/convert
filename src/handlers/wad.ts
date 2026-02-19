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
        CommonFormats.ZIP.builder("zip").allowFrom().allowTo().markLossless(),
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

    private buildWAD(lumps: WadLump[], wadType: string = "PWAD"): Uint8Array {
        const headerSize = 12;
        let dataSize = 0;
        for (const lump of lumps) dataSize += lump.data.length;
        const dirSize = lumps.length * 16;
        const total = headerSize + dataSize + dirSize;

        const buffer = new Uint8Array(total);
        const view = new DataView(buffer.buffer);

        // Write WAD type magic (IWAD or PWAD)
        const magic = wadType === "IWAD" ? "IWAD" : "PWAD";
        buffer[0] = magic.charCodeAt(0);
        buffer[1] = magic.charCodeAt(1);
        buffer[2] = magic.charCodeAt(2);
        buffer[3] = magic.charCodeAt(3);
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
            // Lump name: 8 bytes, null-padded (preserve original casing)
            const nameBytes = encoder.encode(lumps[i].name.substring(0, 8));
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
                    
                    // Store WAD metadata for lossless roundtrip
                    const metadata = {
                        wadType: type,
                        lumps: lumps.map((l, i) => ({ index: i, name: l.name }))
                    };
                    zip.file(".wadmeta.json", JSON.stringify(metadata, null, 2));
                    
                    const nameCounts: Record<string, number> = {};
                    for (let i = 0; i < lumps.length; i++) {
                        const lump = lumps[i];
                        let zipName = lump.name || "UNNAMED";
                        // Deduplicate names by appending index
                        if (nameCounts[zipName] !== undefined) {
                            nameCounts[zipName]++;
                            zipName = `${zipName}.${i}`;
                        } else {
                            nameCounts[zipName] = 1;
                            // Add index for first occurrence for consistency
                            zipName = `${zipName}.${i}`;
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
                    // WAD → WAD (passthrough / preserve type)
                    const rebuilt = this.buildWAD(lumps, type);
                    outputFiles.push({ bytes: rebuilt, name: baseName + ".wad" });
                }
            }

        } else if (inputFormat.internal === "zip") {
            // ZIP → WAD: each zip entry becomes a lump
            for (const file of inputFiles) {
                const baseName = file.name.replace(/\.zip$/i, "");
                const zip = await JSZip.loadAsync(file.bytes);
                
                // Check for metadata file for lossless conversion
                let wadType = "PWAD";
                let metadata: { wadType: string; lumps: { index: number; name: string }[] } | null = null;
                
                const metaFile = zip.files[".wadmeta.json"];
                if (metaFile && !metaFile.dir) {
                    try {
                        const metaText = await metaFile.async("string");
                        const parsedMeta = JSON.parse(metaText);
                        metadata = parsedMeta;
                        wadType = parsedMeta.wadType;
                    } catch (e) {
                        // Invalid metadata, proceed without it
                    }
                }
                
                const lumps: WadLump[] = [];
                
                if (metadata) {
                    // Lossless mode: reconstruct using metadata
                    for (const lumpMeta of metadata.lumps) {
                        const zipFileName = `${lumpMeta.name}.${lumpMeta.index}`;
                        const entry = zip.files[zipFileName];
                        if (entry && !entry.dir) {
                            const data = await entry.async("uint8array");
                            lumps.push({ name: lumpMeta.name, data });
                        } else {
                            // File missing, create empty lump
                            lumps.push({ name: lumpMeta.name, data: new Uint8Array(0) });
                        }
                    }
                } else {
                    // Lossy mode: extract files as best effort
                    const sortedPaths = Object.keys(zip.files).sort();
                    for (const filePath of sortedPaths) {
                        const entry = zip.files[filePath];
                        if (entry.dir) continue;
                        const data = await entry.async("uint8array");
                        // Use filename without extension as lump name (max 8 chars)
                        const lumpName = filePath.split("/").pop()!
                            .replace(/\.[^.]*$/, "")
                            .substring(0, 8);
                        lumps.push({ name: lumpName, data });
                    }
                }

                const wadBytes = this.buildWAD(lumps, wadType);
                outputFiles.push({ bytes: wadBytes, name: baseName + ".wad" });
            }
        }

        return outputFiles;
    }

}

export default wadHandler;
