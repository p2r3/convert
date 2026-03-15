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
                category: "image",
                lossless: false,
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
        
        if (inputFormat.internal === "ota" && outputFormat.mime === CommonFormats.PNG.mime) {
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
        else if (inputFormat.mime === CommonFormats.PNG.mime && outputFormat.internal === "ota") {
            for (const file of inputFiles) {
                let writer_array: number[] = [];
                
                // Some code copied from mcmap.ts
                const blob = new Blob([file.bytes as BlobPart], { type: inputFormat.mime });

                const image = new Image();
                await new Promise((resolve, reject) => {
                    image.addEventListener("load", resolve);
                    image.addEventListener("error", reject);
                    image.src = URL.createObjectURL(blob);
                });

                if (image.naturalWidth > 255) {
                    this.#canvas.width = 255;
                }
                else {
                    this.#canvas.width = image.width;
                }
                if (image.naturalHeight > 255) {
                    this.#canvas.height = 255;
                }
                else {
                    this.#canvas.height = image.height;
                }
                this.#ctx.drawImage(image, 0, 0, this.#canvas.width, this.#canvas.height);

                const pixels = this.#ctx.getImageData(0, 0, this.#canvas.width, this.#canvas.height);
                console.log(pixels.data);

                // Start writing our .otb file, first with the header
                writer_array.push(0, this.#canvas.width, this.#canvas.height, 1);
                let bits = [];
                
                // Then iterate through image data
                for (let i = 0; i < pixels.data.length; i = i + 4) {
                    // Determine the "perceived" lightness of a pixel by the human eye.
                    let luminance = pixels.data[i]*0.2126 + pixels.data[i+1]*0.7152 + pixels.data[i+2]*0.0722;
                    
                    if (luminance > 0.5*255) {
                        bits.push("0");
                    }
                    else {
                        bits.push("1");
                    }
                }
                console.log(bits);
                
                // Pad bits
                while (bits.length % 8 !== 0) {
                    bits.push("0");
                }
                
                // Finally, use the bits to write to our file's bytes
                for (let i = 0; i < bits.length; i = i + 8) {
                    let result: string = bits[i+0].concat(bits[i+1],bits[i+2],bits[i+3],bits[i+4],bits[i+5],bits[i+6],bits[i+7]);
                    
                    writer_array.push( parseInt(result,2) );
                }
                
                outputFiles.push({
                    name: file.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension,
                    bytes: new Uint8Array(writer_array)
                })
            }
        }
        else {
            throw new Error("Invalid input-output.");
        }
    
        return outputFiles;
    }
}

export default otaHandler;
