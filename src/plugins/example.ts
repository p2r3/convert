
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

/**
 * An example plugin that reverses the content of text files.
 * This demonstrates how to implement the FormatHandler interface.
 */
class ReverseTextHandler implements FormatHandler {

    public name: string = "Reverse Text (Plugin Example)";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    async init() {
        this.supportedFormats = [
            {
                name: "Text File (Reversed)",
                format: "txt-rev",
                extension: "txt",
                mime: "text/plain",
                from: false, // We don't support converting FROM this specific "format" in this example
                to: true,    // We support converting TO this format (by reversing input)
                internal: "txt-rev"
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

        for (const file of inputFiles) {
            // Decode bytes to string
            const text = new TextDecoder().decode(file.bytes);

            // Reverse the string
            const reversed = text.split("").reverse().join("");

            // Encode back to bytes
            const bytes = new TextEncoder().encode(reversed);

            outputFiles.push({
                name: `reversed_${file.name}`,
                bytes: bytes
            });
        }

        return outputFiles;
    }

}

// Default export is required for automatic discovery!
export default ReverseTextHandler;
