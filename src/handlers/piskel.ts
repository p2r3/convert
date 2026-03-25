import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import JSZip from "jszip";

class piskelHandler implements FormatHandler {

    public name: string = "piskel";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    #canvas?: HTMLCanvasElement;
    #ctx?: CanvasRenderingContext2D;

    async init() {
        this.supportedFormats = [
            CommonFormats.PNG.builder("png")
                .markLossless()
                .allowFrom(false)
                .allowTo(true),
            CommonFormats.ZIP.builder("zip")
                .markLossless()
                .allowFrom(false)
                .allowTo(true),
            {
                name: "Piskel Sprite Save File",
                format: "piskel",
                extension: "piskel",
                mime: "image/png+json",
                from: true,
                to: false,
                category: "image",
                internal: "piskel",
                lossless: true
            }
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

        if (!(inputFormat.internal === "piskel" && ["png", "zip"].includes(outputFormat.internal))) {
            throw Error("Invalid input/output format.");
        }

        const outputFiles: FileData[] = [];

        for (const inputFile of inputFiles) {

            const fileRaw = new TextDecoder().decode(inputFile.bytes);
            const contents = JSON.parse(fileRaw);

            const version: number = contents.modelVersion;
            if (version !== 2) {
                throw Error("Only version 2 piskel files are supported.");
            }

            const layers: string[] = contents.piskel.layers;
            if (layers.length === 0) {
                throw Error("No layers to convert.");
            }

            const spriteWidth: number = contents.piskel.width;
            const spriteHeight: number = contents.piskel.height;

            // We're parsing the first layer, because they decided to
            // duplicate the frame count for each layer instead of 
            // keeping it global, despite the fact that each layer 
            // has the same frame count.
            const temp = JSON.parse(layers[0]);
            const frameCount: number = temp.frameCount

            this.#canvas.width = spriteWidth * frameCount;
            this.#canvas.height = spriteHeight;

            // We're clearing here because each layer needs to
            // superimpose itself onto the previous.
            this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);

            for (const layerRaw of layers) {
                const layer = JSON.parse(layerRaw);

                const opacity: number = layer.opacity;

                // I'm not entirely sure, but I think only the first chunk is used?
                const layerB64: string = layer.chunks[0].base64PNG;

                const image = new Image();
                await new Promise((resolve, reject) => {
                    image.addEventListener("load", resolve);
                    image.addEventListener("error", reject);
                    image.src = layerB64;
                });

                this.#ctx.globalAlpha = opacity;
                this.#ctx.drawImage(image, 0, 0);
            }

            if (outputFormat.internal === "png") {
                const bytes: Uint8Array = await new Promise((resolve, reject) => {
                    this.#canvas!.toBlob(blob => {
                        if (!blob) {
                            return reject("Canvas output failed");
                        }
                        blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)));
                    }, "image/png");
                });

                const name = inputFile.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension;
                outputFiles.push({ bytes, name });
            } else if (outputFormat.internal === "zip") {
                const zip = new JSZip();

                const fullUri = this.#canvas.toDataURL("image/png");

                const image = new Image();
                await new Promise((resolve, reject) => {
                    image.addEventListener("load", resolve);
                    image.addEventListener("error", reject);
                    image.src = fullUri;
                });

                this.#canvas.width = spriteWidth;
                this.#canvas.height = spriteHeight;

                const baseName = inputFile.name.split(".").slice(0, -1).join(".");
                for (let x = 0; x > -spriteWidth * frameCount; x -= spriteWidth) {
                    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
                    this.#ctx.drawImage(image, x, 0);

                    const bytes: Uint8Array = await new Promise((resolve, reject) => {
                        this.#canvas!.toBlob(blob => {
                            if (!blob) {
                                return reject("Canvas output failed");
                            }
                            blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)));
                        }, "image/png");
                    });
                    const name = `${baseName}_Frame${-Number(x / spriteWidth)}.png`;
                    zip.file(name, bytes);
                }

                const bytes = await zip.generateAsync({ type: "uint8array" });
                const name = baseName + "." + outputFormat.extension;
                outputFiles.push({ bytes, name });
            }
        }

        return outputFiles;
    }

}

export default piskelHandler;