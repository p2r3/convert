import type { FileData, FileFormat, FormatHandler } from "src/FormatHandler";
import * as NBT from "nbtify";
import CommonFormats from "src/CommonFormats";
import { gzipSync, gunzipSync } from "fflate";

class nbtHandler implements FormatHandler {
    public name: string = "nbt";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    public indent: number = 2

    async init() {
        this.supportedFormats = [
            {
                name: "Named Binary Tag",
                format: "NBT",
                extension: "nbt",
                mime: "application/x-minecraft-nbt",
                from: true,
                to: true,
                internal: "nbt",
                category: "data",
                lossless: true
            },
            {
                name: "Minecraft Schematic",
                format: "SCHEMATIC",
                extension: "schematic",
                mime: "application/x-minecraft-schematic",
                from: true,
                to: true,
                internal: "schematic",
                category: "data",
                lossless: true
            },
            {
                name: "Sponge Schematic",
                format: "SCHEM",
                extension: "schem",
                mime: "application/x-minecraft-schem",
                from: true,
                to: true,
                internal: "schem",
                category: "data",
                lossless: true
            },
            {
                name: "Litematica Schematic",
                format: "LITEMATIC",
                extension: "litematic",
                mime: "application/x-minecraft-litematic",
                from: true,
                to: false,
                internal: "litematic",
                category: "data",
                lossless: true
            },
            CommonFormats.JSON.supported("json", true, true, true),
            {
                name: "String Named Binary Tag",
                format: "SNBT",
                extension: "snbt",
                mime: "application/x-minecraft-snbt",
                from: true,
                to: true,
                internal: "snbt",
                category: "data",
                lossless: true // only compression data is lost
            },
        ]
        this.ready = true
    }


    async doConvert (
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
      ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];
        const decoder = new TextDecoder()
        const encoder = new TextEncoder()

        // nbt / schem / schematic / litematic -> json
        if ((inputFormat.internal == "nbt" || inputFormat.internal == "schem" || inputFormat.internal == "schematic" || inputFormat.internal == "litematic") && outputFormat.internal == "json") {
            for (const file of inputFiles) {
                let unzipped = file.bytes;
                try {
                    // intermediate NBT from schematicConverter will NOT be zipped, but native schems will be
                    if (inputFormat.internal == "schem" || inputFormat.internal == "schematic" || inputFormat.internal == "litematic") {
                        unzipped = gunzipSync(file.bytes);
                    }
                } catch (e) {}

                const nbt = await NBT.read(unzipped);
                const j = JSON.stringify(nbt.data, (key, value) =>
                    typeof value === 'bigint' ? value.toString() : value,
                this.indent);
                outputFiles.push({
                    name: file.name.split(".")[0] + ".json",
                    bytes: encoder.encode(j)
                });
            }
        }
        // json -> nbt / schem / schematic / litematic
        if (inputFormat.internal == "json" && (outputFormat.internal == "nbt" || outputFormat.internal == "schem" || outputFormat.internal == "schematic" || outputFormat.internal == "litematic")) {
            for (const file of inputFiles) {
                const text = decoder.decode(file.bytes)
                const obj = JSON.parse(text)
                let bd = await NBT.write(obj)
                
                if (outputFormat.internal == "schem" || outputFormat.internal == "schematic" || outputFormat.internal == "litematic") {
                    // Schematics require gzipping
                     bd = gzipSync(bd);
                }

                outputFiles.push({
                    name: file.name.split(".")[0] + `.${outputFormat.extension}`,
                    bytes: bd
                })
            }
        }

        // snbt -> nbt / schem / schematic
        if (inputFormat.internal == "snbt" && (outputFormat.internal == "nbt" || outputFormat.internal == "schem" || outputFormat.internal == "schematic")) {
            for (const file of inputFiles) {
                const text = decoder.decode(file.bytes)
                const nbt = NBT.parse(text)
                let bd = await NBT.write(nbt)
                
                if (outputFormat.internal == "schem" || outputFormat.internal == "schematic") {
                    // Schematics require gzipping
                     bd = gzipSync(bd);
                }

                outputFiles.push({
                    name: file.name.split(".")[0] + `.${outputFormat.extension}`,
                    bytes: bd
                })
            }
        }
        if ((inputFormat.internal == "nbt" || inputFormat.internal == "schem" || inputFormat.internal == "schematic" || inputFormat.internal == "litematic") && outputFormat.internal == "snbt") {
            for (const file of inputFiles) {
                let unzipped = file.bytes;
                try {
                    if (inputFormat.internal == "schem" || inputFormat.internal == "schematic" || inputFormat.internal == "litematic") {
                        unzipped = gunzipSync(file.bytes);
                    }
                } catch (e) {}

                const nbt = await NBT.read(unzipped)
                const text = NBT.stringify(nbt, {
                    space: this.indent
                })
                outputFiles.push({
                    name: file.name.split(".")[0] + ".snbt",
                    bytes: encoder.encode(text)
                })
            }
        }

        // snbt <-> json
        if (inputFormat.internal == "snbt" && outputFormat.internal == "json") {
            for (const file of inputFiles) {
                const snbt = decoder.decode(file.bytes)
                const nbt = NBT.parse(snbt)
                const text = JSON.stringify(nbt, (key, value) =>
                    typeof value === 'bigint' ? value.toString() : value,
                this.indent)
                outputFiles.push({
                    name: file.name.split(".")[0] + ".json",
                    bytes: encoder.encode(text)
                })
            }
        }
        if (inputFormat.internal == "json" && outputFormat.internal == "snbt") {
            for (const file of inputFiles) {
                const text = decoder.decode(file.bytes)
                const obj = JSON.parse(text)
                const snbt = NBT.stringify(obj, {
                    space: this.indent
                })
                outputFiles.push({
                    name: file.name.split(".")[0] + ".snbt",
                    bytes: encoder.encode(snbt)
                })
            }
        }

        
        // nbt -> schem / schematic
        if (inputFormat.internal == "nbt" && (outputFormat.internal == "schem" || outputFormat.internal == "schematic")) {
            for (const file of inputFiles) {
                outputFiles.push({
                    name: file.name.split(".")[0] + `.${outputFormat.extension}`,
                    bytes: gzipSync(file.bytes)
                })
            }
        }

        if (outputFiles.length === 0) {
            throw new Error(`nbtHandler does not support route: ${inputFormat.internal} -> ${outputFormat.internal}`);
        }

        return outputFiles
      }
}

export default nbtHandler;