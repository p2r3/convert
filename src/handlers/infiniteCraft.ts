import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import * as fs from 'fs';
import pako from "pako";

class infiniteCraftHandler implements FormatHandler {
    public name: string = "ic";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    async init() {
        this.supportedFormats = [
            CommonFormats.JSON.supported("json", false, true),
            CommonFormats.TEXT.supported("text", true, false),
            {
                name: "Infinite Craft Game Save",
                format: "ic",
                extension: "ic",
                mime: "application/x-infinite-craft-ic",
                from: true,
                to: true,
                internal: "ic",
                category: "archive",
                lossless: false,
            },
            {
                name: "Infinite Craft Helper Save",
                format: "json",
                extension: "json",
                mime: "application/x-infinite-craft-helper",
                from: false,
                to: true,
                internal: "json",
                category: "data",
                lossless: false,
            },
        ];
        this.ready = true;
    }

    async doConvert(
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];

        // ic -> json
        if (inputFormat.internal === "ic" && outputFormat.internal === "json") {
            for (const file of inputFiles) {
                const bytes = pako.ungzip(file.bytes);
                outputFiles.push({
                    name: file.name.replace(/\.ic$/i, ".json"),
                    bytes: bytes,
                });
            }
        }

        // txt -> ic
        if (inputFormat.internal === "text" && outputFormat.internal === "ic") {
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

            const outputFileName = inputFile.name.replace(/\.txt$/i, ".ic");

            outputFiles.push({
                name: outputFileName,
                bytes: compressedBytes,
            });
        }

        return outputFiles;
    }
}

export default infiniteCraftHandler;