import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

class txtToIcHandler implements FormatHandler {

    public name: string = "txttoic";
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
                from: false,
                to: true,
                internal: "ic",
                category: "archive",
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

export default txtToIcHandler;