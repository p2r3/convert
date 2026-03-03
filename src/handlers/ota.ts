// file: ota.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

class otaHandler implements FormatHandler {

    public name: string = "ota";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    #canvas?: HTMLCanvasElement;
    #ctx?: CanvasRenderingContext2D;

    async init () {
        this.supportedFormats = [
            CommonFormats.PNG.supported("png", true, true, true),
            {
                name: "Over The Air bitmap",
                format: "ota",
                extension: "otb",
                mime: "image/x-ota",
                from: true,
                to: true,
                internal: "ota",
            },
        ];

        this.#canvas = document.createElement("canvas");
        this.#ctx = this.#canvas.getContext("2d") || undefined;

        this.ready = true;
    }

    async doConvert (
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];
        
        if (!this.#canvas || !this.#ctx) {
            throw "Handler not initialized.";
        }
        
        if (inputFormat.internal === "ota" && outputFormat.mime == CommonFormats.PNG.mime) {
            for (const file of inputFiles) {
                let new_file_bytes = new Uint8Array(file.bytes);
            
                // Read header to get image size
                this.#canvas.width = new_file_bytes[1];
                this.#canvas.height = new_file_bytes[2];
                
                // Read each byte and write 8 pixels to screen per
                const rgba: number[] = []
                for (let i = 0; i < new_file_bytes.length - 4; i++) {
                    for (let bit = 7; bit > -1; bit--) {
                        // Convert to binary and look at the bits.
                        if (new_file_bytes[i+4] & (1 << bit)) {
                            rgba.push(0, 0, 0, 255);
                        }
                        else {
                            rgba.push(255, 255, 255, 255);
                        }
                        
                        if (rgba.length >= (this.#canvas.width * this.#canvas.height*4)) {
                            break;
                        }
                    }
                    
                    if (rgba.length >= (this.#canvas.width * this.#canvas.height*4)) {
                        break;
                    }
                }
                
                // Writes our results to the canvas
                const image_data = new ImageData(new Uint8ClampedArray(rgba), this.#canvas.width, this.#canvas.height);

                this.#ctx.putImageData(image_data, 0, 0);

                new_file_bytes = await new Promise((resolve, reject) => {
                    this.#canvas!.toBlob((blob) => {
                        if (!blob) return reject("Canvas output failed");
                        blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
                    }, outputFormat.mime);
                });
                
                outputFiles.push({
                    name: file.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension,
                    bytes: new_file_bytes
                })
            }
        }

        return outputFiles;
    }
}

export default otaHandler;