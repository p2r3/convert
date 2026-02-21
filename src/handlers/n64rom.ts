import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import normalizeMimeType from "../normalizeMimeType.ts";
import CommonFormats from "src/CommonFormats.ts";

const ROM_MAGIC = {
  z64: [0x80, 0x37, 0x12, 0x40],
  v64: [0x37, 0x80, 0x40, 0x12],
  n64: [0x40, 0x12, 0x37, 0x80]
};

const MAX_CANVAS_DIMENSION = 16384;
const N64_ROM_MIME = normalizeMimeType("application/x-n64-rom");

type N64Order = "z64" | "n64" | "v64";

class n64romHandler implements FormatHandler {

  public name: string = "n64rom";
  public supportedFormats: FileFormat[] = [
    {
      name: "Nintendo 64 ROM (Big Endian)",
      format: "z64",
      extension: "z64",
      mime: N64_ROM_MIME,
      from: true,
      to: true,
      internal: "z64",
      category: "data",
      lossless: true
    },
    {
      name: "Nintendo 64 ROM (Little Endian)",
      format: "n64",
      extension: "n64",
      mime: N64_ROM_MIME,
      from: true,
      to: true,
      internal: "n64",
      category: "data",
      lossless: true
    },
    {
      name: "Nintendo 64 ROM (Byte-swapped)",
      format: "v64",
      extension: "v64",
      mime: N64_ROM_MIME,
      from: true,
      to: true,
      internal: "v64",
      category: "data",
      lossless: true
    },
    CommonFormats.PNG.builder("n64png")
      .allowFrom()
      .allowTo()
      .markLossless()
  ];
  public ready: boolean = false;

  #canvas?: HTMLCanvasElement;
  #ctx?: CanvasRenderingContext2D;

  async init () {
    this.#canvas = document.createElement("canvas");
    this.#ctx = this.#canvas.getContext("2d") || undefined;
    this.ready = true;
  }

  #swap16 (bytes: Uint8Array): Uint8Array {
    const out = new Uint8Array(bytes);
    for (let i = 0; i + 1 < out.length; i += 2) {
      const a = out[i];
      out[i] = out[i + 1];
      out[i + 1] = a;
    }
    return out;
  }

  #swap32 (bytes: Uint8Array): Uint8Array {
    const out = new Uint8Array(bytes);
    for (let i = 0; i + 3 < out.length; i += 4) {
      const a = out[i];
      const b = out[i + 1];
      out[i] = out[i + 3];
      out[i + 1] = out[i + 2];
      out[i + 2] = b;
      out[i + 3] = a;
    }
    return out;
  }

  #detectOrder (bytes: Uint8Array): N64Order | null {
    if (bytes.length < 4) return null;
    const b0 = bytes[0];
    const b1 = bytes[1];
    const b2 = bytes[2];
    const b3 = bytes[3];
    if (
      b0 === ROM_MAGIC.z64[0]
      && b1 === ROM_MAGIC.z64[1]
      && b2 === ROM_MAGIC.z64[2]
      && b3 === ROM_MAGIC.z64[3]
    ) return "z64";
    if (
      b0 === ROM_MAGIC.n64[0]
      && b1 === ROM_MAGIC.n64[1]
      && b2 === ROM_MAGIC.n64[2]
      && b3 === ROM_MAGIC.n64[3]
    ) return "n64";
    if (
      b0 === ROM_MAGIC.v64[0]
      && b1 === ROM_MAGIC.v64[1]
      && b2 === ROM_MAGIC.v64[2]
      && b3 === ROM_MAGIC.v64[3]
    ) return "v64";
    return null;
  }

  #toZ64 (bytes: Uint8Array, order: N64Order): Uint8Array {
    if (order === "z64") return new Uint8Array(bytes);
    if (order === "n64") return this.#swap32(bytes);
    return this.#swap16(bytes);
  }

  #fromZ64 (bytes: Uint8Array, order: N64Order): Uint8Array {
    if (order === "z64") return new Uint8Array(bytes);
    if (order === "n64") return this.#swap32(bytes);
    return this.#swap16(bytes);
  }

  #choosePackedDimensions (pixelCount: number): { width: number; height: number } {
    if (pixelCount <= 0) throw "Input ROM is empty.";
    if (!Number.isInteger(pixelCount)) {
      throw "Invalid packed pixel count.";
    }

    const max = Math.min(MAX_CANVAS_DIMENSION, pixelCount);
    for (let width = Math.floor(Math.sqrt(pixelCount)); width >= 1; width--) {
      if (width > max) continue;
      if (pixelCount % width !== 0) continue;
      const height = pixelCount / width;
      if (height <= MAX_CANVAS_DIMENSION) return { width, height };
    }

    throw "ROM is too large to encode as PNG within canvas limits.";
  }

  #packZ64ToOpaqueRgba (z64Bytes: Uint8Array): Uint8ClampedArray {
    const byteLength = z64Bytes.length;
    if (byteLength <= 0) throw "Input ROM is empty.";
    if (byteLength % 4 !== 0) {
      throw "N64 ROM length must be divisible by 4.";
    }

    const chunks = byteLength / 4;
    const rgba = new Uint8ClampedArray(chunks * 8);
    for (let i = 0; i < chunks; i++) {
      const inOffset = i * 4;
      const outOffset = i * 8;

      // Pixel 1: first three ROM bytes.
      rgba[outOffset] = z64Bytes[inOffset];
      rgba[outOffset + 1] = z64Bytes[inOffset + 1];
      rgba[outOffset + 2] = z64Bytes[inOffset + 2];
      rgba[outOffset + 3] = 255;

      // Pixel 2: fourth ROM byte in R; keep G/B fixed.
      rgba[outOffset + 4] = z64Bytes[inOffset + 3];
      rgba[outOffset + 5] = 0;
      rgba[outOffset + 6] = 0;
      rgba[outOffset + 7] = 255;
    }
    return rgba;
  }

  #unpackOpaqueRgbaToZ64 (rgba: Uint8ClampedArray): Uint8Array {
    if (rgba.length % 8 !== 0 || rgba.length === 0) {
      throw "PNG dimensions are incompatible with N64 ROM packed image format.";
    }

    const chunks = rgba.length / 8;
    const out = new Uint8Array(chunks * 4);
    for (let i = 0; i < chunks; i++) {
      const inOffset = i * 8;
      const outOffset = i * 4;
      out[outOffset] = rgba[inOffset];
      out[outOffset + 1] = rgba[inOffset + 1];
      out[outOffset + 2] = rgba[inOffset + 2];
      out[outOffset + 3] = rgba[inOffset + 4];
    }
    return out;
  }

  async #pngWrapToZ64 (bytes: Uint8Array): Promise<Uint8Array> {
    if (!this.#canvas || !this.#ctx) throw "Handler not initialized.";

    const blob = new Blob([bytes as BlobPart], { type: "image/png" });
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve);
      image.addEventListener("error", reject);
      image.src = URL.createObjectURL(blob);
    });

    this.#canvas.width = image.naturalWidth;
    this.#canvas.height = image.naturalHeight;
    this.#ctx.drawImage(image, 0, 0);

    const rgba = this.#ctx.getImageData(0, 0, this.#canvas.width, this.#canvas.height).data;
    return this.#unpackOpaqueRgbaToZ64(rgba);
  }

  async #z64ToPngWrap (z64Bytes: Uint8Array): Promise<Uint8Array> {
    if (!this.#canvas || !this.#ctx) throw "Handler not initialized.";
    const rgba = this.#packZ64ToOpaqueRgba(z64Bytes);
    const pixels = rgba.length / 4;
    const { width, height } = this.#choosePackedDimensions(pixels);
    const imageDataBytes = new Uint8ClampedArray(rgba.length);
    imageDataBytes.set(rgba);

    this.#canvas.width = width;
    this.#canvas.height = height;
    this.#ctx.putImageData(new ImageData(imageDataBytes, width, height), 0, 0);

    return await new Promise((resolve, reject) => {
      this.#canvas!.toBlob((blob) => {
        if (!blob) return reject("Canvas output failed");
        blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
      }, "image/png");
    });
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    if (!this.#canvas || !this.#ctx) {
      throw "Handler not initialized.";
    }

    const outputFiles: FileData[] = [];
    const outputOrder = outputFormat.internal as N64Order | "n64png";

    for (const inputFile of inputFiles) {
      let z64Bytes: Uint8Array;

      if (inputFormat.internal === "n64png") {
        z64Bytes = await this.#pngWrapToZ64(inputFile.bytes);
      } else {
        const declaredOrder = inputFormat.internal as N64Order;
        const detectedOrder = this.#detectOrder(inputFile.bytes);
        const effectiveOrder = detectedOrder || declaredOrder;
        z64Bytes = this.#toZ64(inputFile.bytes, effectiveOrder);
      }

      let bytes: Uint8Array;
      if (outputOrder === "n64png") {
        bytes = await this.#z64ToPngWrap(z64Bytes);
      } else {
        bytes = this.#fromZ64(z64Bytes, outputOrder);
      }

      const baseName = inputFile.name.split(".")[0];
      const name = baseName + "." + outputFormat.extension;
      outputFiles.push({ bytes, name });
    }

    return outputFiles;
  }

}

export default n64romHandler;
