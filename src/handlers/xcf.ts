import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import XCF from "./gimper/src/main.js";

class xcfHandler implements FormatHandler {

    public name: string = "xcf";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    #canvas?: HTMLCanvasElement;
    #ctx?: CanvasRenderingContext2D;

    async init() {
        this.supportedFormats = [
            {
                name: "eXperimental Computing Facility (GIMP)",
                format: "xcf",
                extension: "xcf",
                mime: "image/x-xcf",
                from: true,
                to: false,
                internal: "xcf",
                category: "image",
                lossless: true
            },
            CommonFormats.PNG.builder("png")
                .markLossless()
                .allowFrom(false)
                .allowTo(true),
        ];

        this.#canvas = document.createElement("canvas");
        const ctx = this.#canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to create 2D rendering context.");
        }
        this.#ctx = ctx;

        this.ready = true;
    }

    async doConvert(
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        if (!this.ready || !this.#canvas || !this.#ctx) {
            throw new Error("Handler not initialized!");
        }

        const outputFiles: FileData[] = [];

        if (inputFormat.internal !== "xcf" || outputFormat.internal !== "png") {
            throw Error("Invalid input/output format.");
        }

        for (const inputFile of inputFiles) {
            const xcf = await XCF.from_bytes(new Uint8Array(inputFile.bytes));

            if (xcf.layers.length === 0) {
                throw Error("No layers to convert.");
            }

            for (let i = 0; i < xcf.layers.length; i++) {
                const layer = xcf.layers[i];
                const bpp = layer.hierarchy.bpp;

                if (![3, 4].includes(bpp)) {
                    throw Error("Only RGB and RGBA in 8-bit precision is supported.");
                }

                this.#canvas.width = layer.width;
                this.#canvas.height = layer.height;
                this.#ctx.clearRect(0, 0, layer.width, layer.height);

                const pixel_data = await xcf.getLayerPixels(i);

                const image_data = this.#ctx.createImageData(layer.width, layer.height);

                for (let y = 0; y < layer.height; y++) {
                    for (let x = 0; x < layer.width; x++) {
                        const pixel = pixel_data[y][x];
                        const [r, g, b] = bpp === 4 ? pixel.slice(0, -1) : pixel;

                        let a = 255;
                        if (bpp === 4) {
                            a = pixel.at(-1)!;
                        }

                        const i = (y * layer.width + x) * 4;
                        image_data.data[i] = r;
                        image_data.data[i + 1] = g;
                        image_data.data[i + 2] = b;
                        image_data.data[i + 3] = a;
                    }
                }

                this.#ctx.putImageData(image_data, 0, 0);

                const bytes: Uint8Array = await new Promise((resolve, reject) => {
                    this.#canvas!.toBlob(blob => {
                        if (!blob) {
                            return reject("Canvas output failed");
                        }
                        blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)));
                    }, "image/png");
                });

                const name = inputFile.name.split(".").slice(0, -1).join(".") + `_${layer.name}` + "." + outputFormat.extension;
                outputFiles.push({ bytes, name });
            }
        }

        return outputFiles;
    }

}

export default xcfHandler;