import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";

class txtToInfiniteCraftHandler implements FormatHandler {

    public name: string = "txtToInfiniteCraft";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    async init () {
        this.supportedFormats = [
            CommonFormats.TEXT.supported("text", true, false),
            {
                name: "Infinite Craft Save File",
                format: "ic",
                extension: "ic",
                mime: "application/x-infinite-craft-ic",
                internal: "ic",
                category: Category.ARCHIVE,
                from: false,
                to: true,
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
        const inputFile = inputFiles[0];
        const text = new TextDecoder().decode(inputFile.bytes);
        const words = text
            .split(/[^a-zA-Z0-9']+/)
            .filter(Boolean);

        const emojis = ["💧", "🔥", "🌬️", "🌍", "⚡", "❄️", "🌟", "🌈", "🌊", "🍃"];

        function getRandomEmoji(): string {
            return emojis[Math.floor(Math.random() * emojis.length)];
        }

        const jsonData = {
            name: "Save 1",
            version: "1.0",
            created: Date.now(),
            updated: 0,
            instances: [] as any[],
            items: words.map((word, index) => ({
                id: index,
                text: word,
                emoji: getRandomEmoji(),
            })),
        };

        const outputBytes = new TextEncoder().encode(JSON.stringify(jsonData, null, 2));

        const cs = new CompressionStream("gzip");

        const inputStream = new Response(outputBytes).body!;

        const compressedStream = inputStream.pipeThrough(cs);

        const compressedBytes = new Uint8Array(await new Response(compressedStream).arrayBuffer());

        const inputFileName = inputFile.name;

        const outputFileName = inputFileName.replace(/\.txt$/i, ".ic");

        const outputFiles: FileData[] = [
            {
                name: outputFileName,
                bytes: compressedBytes,
            },
        ];
        return outputFiles;
    }

}

class infiniteCraftToJsonHandler implements FormatHandler {

    public name: string = "infiniteCraftToJson";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    async init() {
        this.supportedFormats = [
            {
                name: "Infinite Craft Save File",
                format: "ic",
                extension: "ic",
                mime: "application/x-infinite-craft-ic",
                internal: "ic",
                category: Category.ARCHIVE,
                from: true,
                to: false,
                lossless: true
            },
            CommonFormats.JSON.supported("json", false, true, true),
        ];
        this.ready = true;
    }

    async doConvert (
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        // Credit to als.ts
        if (inputFormat.internal !== "ic" || outputFormat.internal !== "json") {
            throw new TypeError(`Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`);
        }

        const decoder = new TextDecoder("utf-8", { fatal: true });
        const encoder = new TextEncoder();

        return Promise.all(inputFiles.map(async (inputFile) => {
            if (
                inputFile.bytes.length < 2
                || inputFile.bytes[0] !== 0x1f
                || inputFile.bytes[1] !== 0x8b
            ) {
                throw new Error("Invalid IC file: expected gzip-compressed data.");
            }

            const decompressedStream = new Blob([inputFile.bytes as BlobPart])
            .stream()
            .pipeThrough(new DecompressionStream("gzip"));
            const decompressedBytes = new Uint8Array(await new Response(decompressedStream).arrayBuffer());

            let json: string;
            try {
                json = decoder.decode(decompressedBytes);
            } catch (_) {
                throw new Error("Invalid IC file: decompressed data is not UTF-8 JSON.");
            }
            if (json.trimStart().startsWith("[")) {
                throw new Error("Invalid IC file: decompressed data should not be an array in JSON.");
            } else if (!json.trimStart().startsWith("{")) {
                throw new Error("Invalid IC file: decompressed data is not JSON.");
            }

            const baseNameParts = inputFile.name.split(".");
            const baseName = baseNameParts.length > 1
                ? baseNameParts.slice(0, -1).join(".")
                : inputFile.name;

            return {
                name: `${baseName}.json`,
                bytes: encoder.encode(json)
            };
        }));
    }

}

export {txtToInfiniteCraftHandler, infiniteCraftToJsonHandler};
