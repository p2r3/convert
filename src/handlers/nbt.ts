import type { FileData, FileFormat, FormatHandler } from "src/FormatHandler";
import * as NBT from "nbtify";
import CommonFormats from "src/CommonFormats";

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
                lossless: true
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

        // nbt <-> json
        if (inputFormat.internal == "nbt" && outputFormat.internal == "json") {
            for (const file of inputFiles) {
                const nbt = await NBT.read(file.bytes);
                const j = JSON.stringify(nbt.data, null, this.indent)
                outputFiles.push({
                    name: file.name.split(".")[0] + ".json",
                    bytes: encoder.encode(j)
                })
            }
        }
        if (inputFormat.internal == "json" && outputFormat.internal == "nbt") {
            for (const file of inputFiles) {
                const text = decoder.decode(file.bytes)
                const obj = JSON.parse(text)
                const bd = await NBT.write(obj)
                outputFiles.push({
                    name: file.name.split(".")[0] + ".nbt",
                    bytes: bd
                })
            }
        }

        // snbt <-> nbt
        if (inputFormat.internal == "snbt" && outputFormat.internal == "nbt") {
            for (const file of inputFiles) {
                const text = decoder.decode(file.bytes)
                const nbt = NBT.parse(text)
                const bd = await NBT.write(nbt)
                outputFiles.push({
                    name: file.name.split(".")[0] + ".nbt",
                    bytes: bd
                })
            }
        }
        if (inputFormat.internal == "nbt" && outputFormat.internal == "snbt") {
            for (const file of inputFiles) {
                const nbt = await NBT.read(file.bytes)
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
                const text = JSON.stringify(nbt, null, this.indent)
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

        return outputFiles
      }
}

export default nbtHandler;