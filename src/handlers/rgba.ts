// file: rgba.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

class rgbaHandler implements FormatHandler {

    public name: string = "rgba";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    #canvas?: HTMLCanvasElement;
    #ctx?: CanvasRenderingContext2D;

    async init () {
        this.supportedFormats = [
            CommonFormats.PNG.supported("png", true, true, true),
            {
                name: "Raw red, green, and blue samples",
                format: "rgb",
                extension: "rgb",
                mime: "image/x-rgb",
                from: true,
                to: true,
                internal: "rgb",
                category: "image",
                lossless: false
            },
            {
                name: "Raw red, green, blue, and alpha samples",
                format: "rgba",
                extension: "rgba",
                mime: "image/x-rgba",
                from: true,
                to: true,
                internal: "rgba",
                category: "image",
                lossless: true
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
        
        for (const file of inputFiles) {
            let new_file_bytes = new Uint8Array(file.bytes);

            if (inputFormat.mime == CommonFormats.PNG.mime) {
                if (outputFormat.internal == "rgba") {
                    // Some code copied from mcmap.ts
                    const blob = new Blob([file.bytes as BlobPart], { type: inputFormat.mime });

                    const image = new Image();
                    await new Promise((resolve, reject) => {
                        image.addEventListener("load", resolve);
                        image.addEventListener("error", reject);
                        image.src = URL.createObjectURL(blob);
                    });

                    this.#canvas.width = image.width;
                    this.#canvas.height = image.height;
                    this.#ctx.drawImage(image, 0, 0);

                    const pixels = this.#ctx.getImageData(0, 0, this.#canvas.width, this.#canvas.height);

                    new_file_bytes = new Uint8Array(pixels.data);
                }
                else if (outputFormat.internal == "rgb") {
                    throw new Error("This handler doesn't need to convert png to rgb, let ImageMagik do that.");
                }
                else {
                    throw new Error("Invalid input-output.");
                }
            }
            else if (inputFormat.internal == "rgb") {
                if (new_file_bytes.length % 3 != 0) {
                    throw new Error("Invalid RGB file size; not a whole number of samples.");
                }

                if (outputFormat.internal == "rgba") {
                    // Fill in with 255 in alpha channel
                    let writer_array = new Uint8Array(new_file_bytes.length + Math.floor(new_file_bytes.length / 3));
                    let writer_counter = 0;
                    for (let i = 0; i < new_file_bytes.length; i++) {
                        if (i % 3 == 2) {
                            writer_array.set(new Uint8Array([new_file_bytes[i]]),writer_counter);
                            writer_counter += 1;
                            writer_array.set(new Uint8Array([0xFF]),writer_counter);
                            writer_counter += 1;
                        }
                        else {
                            writer_array.set(new Uint8Array([new_file_bytes[i]]),writer_counter);
                            writer_counter += 1;
                        }
                    }
                    new_file_bytes = new Uint8Array(writer_array);
                }
                else if (outputFormat.mime == CommonFormats.PNG.mime) {
                    throw new Error("This handler doesn't need to convert rgb to png, let ImageMagik do that.");
                }
                else {
                    throw new Error("Invalid input-output.");
                }
            }
            else if (inputFormat.internal == "rgba") {
                if (new_file_bytes.length % 4 != 0) {
                    throw new Error("Invalid RGBA file size; not a whole number of samples.");
                }

                if (outputFormat.internal == "rgb") {
                    // Remove every fourth, byte! Every fourth, byte!
                    let writer_array = new Uint8Array(new_file_bytes.length - Math.floor(new_file_bytes.length / 4));
                    let writer_counter = 0;
                    for (let i = 0; i < new_file_bytes.length; i++) {
                        if (i % 4 != 3) {
                            writer_array.set(new Uint8Array([new_file_bytes[i]]),writer_counter);
                            writer_counter += 1;
                        }
                    }
                    new_file_bytes = new Uint8Array(writer_array);
                }
                else if (outputFormat.mime == CommonFormats.PNG.mime) {
                    // Determine image dimensions: smallest number x such that x^2 is >= total samples                    
                    const total_samples = new_file_bytes.length/4;
                    let image_sw = 0;

                    while (true) {
                        if (image_sw * image_sw >= total_samples) {
                            break;
                        }
                        image_sw += 1;
                    }

                    // Set canvas dimensions to this value
                    this.#canvas.width = image_sw;
                    this.#canvas.height = image_sw;
                    
                    // Determine color per-pixel and write that value to the buffer
                    let color = [0,0,0];
                    const rgba: number[] = []
                    for (let i = 0; i < this.#canvas.width * this.#canvas.height; i++) {
                        try {
                            color = [new_file_bytes[0+i*4],new_file_bytes[1+i*4],new_file_bytes[2+i*4]];
                            rgba.push(...color, new_file_bytes[3+i*4]);
                        }
                        catch {
                            color = [0,0,0];
                            rgba.push(...color, 255);
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
                }
                else {
                    throw new Error("Invalid input-output.");
                }
            }
            else {
                throw new Error("Invalid input.");
            }

            outputFiles.push({
                name: file.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension,
                bytes: new_file_bytes
            })
        }
        return outputFiles;
    }
}

export default rgbaHandler;