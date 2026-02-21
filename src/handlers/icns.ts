import CommonFormats from "src/CommonFormats.ts";
import { FormatDefinition, type FileData, type FileFormat, type FormatHandler } from "../FormatHandler.ts";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const ICNS_MAGIC = "icns";
const ICNS_FORMAT = new FormatDefinition(
  "Apple Icon Image",
  "icns",
  "icns",
  "image/icns",
  "image"
);

const ICON_SIZES = [16, 32, 64, 128, 256, 512, 1024];

const ICON_TYPE_BY_SIZE = new Map<number, string>([
  [16, "icp4"],
  [32, "icp5"],
  [64, "icp6"],
  [128, "ic07"],
  [256, "ic08"],
  [512, "ic09"],
  [1024, "ic10"]
]);

const ICON_SIZE_BY_TYPE = new Map<string, number>(
  Array.from(ICON_TYPE_BY_SIZE.entries()).map(([size, type]) => [type, size])
);

function isPng (bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

function readUint32BE (bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint32(offset, false);
}

function writeUint32BE (
  bytes: Uint8Array,
  offset: number,
  value: number
): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .setUint32(offset, value, false);
}

function readFourCC (bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3]
  );
}

function writeFourCC (bytes: Uint8Array, offset: number, value: string): void {
  if (value.length !== 4) throw "FourCC must have exactly 4 characters.";
  bytes[offset] = value.charCodeAt(0);
  bytes[offset + 1] = value.charCodeAt(1);
  bytes[offset + 2] = value.charCodeAt(2);
  bytes[offset + 3] = value.charCodeAt(3);
}

export function parsePngDimensions (pngBytes: Uint8Array): { width: number, height: number } {
  if (!isPng(pngBytes)) throw "Input is not a PNG file.";
  if (pngBytes.length < 24) throw "Input PNG is truncated.";
  const ihdr = readFourCC(pngBytes, 12);
  if (ihdr !== "IHDR") throw "Invalid PNG data (missing IHDR chunk).";
  return {
    width: readUint32BE(pngBytes, 16),
    height: readUint32BE(pngBytes, 20)
  };
}

export function resolveLargestIconSize (maxDimension: number): number {
  const normalized = Math.max(1, Math.round(maxDimension));
  for (const size of ICON_SIZES) {
    if (normalized <= size) return size;
  }
  return ICON_SIZES[ICON_SIZES.length - 1];
}

export function extractBestPngFromIcns (icnsBytes: Uint8Array): Uint8Array {
  if (icnsBytes.length < 8) throw "Input is too small for an ICNS file.";
  if (readFourCC(icnsBytes, 0) !== ICNS_MAGIC) throw "Invalid ICNS signature.";

  const declaredLength = readUint32BE(icnsBytes, 4);
  const endOffset = Math.min(icnsBytes.length, declaredLength);
  if (declaredLength < 8) throw "Invalid ICNS length.";

  let bestPng: Uint8Array | null = null;
  let bestSize = 0;
  let offset = 8;

  while (offset + 8 <= endOffset) {
    const type = readFourCC(icnsBytes, offset);
    const chunkLength = readUint32BE(icnsBytes, offset + 4);
    if (chunkLength < 8) break;
    const chunkEnd = offset + chunkLength;
    if (chunkEnd > endOffset) break;

    const payload = icnsBytes.subarray(offset + 8, chunkEnd);
    if (isPng(payload)) {
      const iconSize = ICON_SIZE_BY_TYPE.get(type) ?? 0;
      if (!bestPng || iconSize > bestSize || (iconSize === bestSize && payload.length > bestPng.length)) {
        bestPng = new Uint8Array(payload);
        bestSize = iconSize;
      }
    }

    offset = chunkEnd;
  }

  if (!bestPng) {
    throw "ICNS file does not contain a PNG icon payload.";
  }

  return bestPng;
}

class icnsHandler implements FormatHandler {

  public name: string = "icns";
  public ready: boolean = false;
  public supportedFormats: FileFormat[] = [
    CommonFormats.PNG.supported("png", true, true, true),
    ICNS_FORMAT.builder("icns")
      .allowFrom(true)
      .allowTo(true)
      // ICNS contains a finite icon set; conversions here are not guaranteed bit-exact round-trips.
      .markLossless(false)
  ];

  #canvas?: HTMLCanvasElement;
  #ctx?: CanvasRenderingContext2D;

  async init () {
    this.#canvas = document.createElement("canvas");
    this.#ctx = this.#canvas.getContext("2d") || undefined;
    if (!this.#ctx) throw "Failed to initialize canvas context.";
    this.ready = true;
  }

  async #canvasToPngBytes (size: number, bitmap: ImageBitmap): Promise<Uint8Array> {
    if (!this.#canvas || !this.#ctx) throw "Handler not initialized.";

    this.#canvas.width = size;
    this.#canvas.height = size;
    this.#ctx.clearRect(0, 0, size, size);
    this.#ctx.drawImage(bitmap, 0, 0, size, size);

    const blob = await new Promise<Blob>((resolve, reject) => {
      this.#canvas!.toBlob(output => {
        if (!output) return reject("Failed to encode canvas to PNG.");
        resolve(output);
      }, "image/png");
    });

    return new Uint8Array(await blob.arrayBuffer());
  }

  async #encodeIcns (pngBytes: Uint8Array): Promise<Uint8Array> {
    const dimensions = parsePngDimensions(pngBytes);
    const largestSize = resolveLargestIconSize(Math.max(dimensions.width, dimensions.height));
    const targetSizes = ICON_SIZES.filter(size => size <= largestSize);

    const bitmap = await createImageBitmap(new Blob([pngBytes as BlobPart], { type: "image/png" }));

    const chunks: Array<{ type: string, bytes: Uint8Array }> = [];
    try {
      for (const size of targetSizes) {
        const iconType = ICON_TYPE_BY_SIZE.get(size);
        if (!iconType) continue;
        const iconBytes = await this.#canvasToPngBytes(size, bitmap);
        chunks.push({ type: iconType, bytes: iconBytes });
      }
    } finally {
      bitmap.close();
    }

    let totalLength = 8;
    for (const chunk of chunks) {
      totalLength += 8 + chunk.bytes.length;
    }

    const output = new Uint8Array(totalLength);
    writeFourCC(output, 0, ICNS_MAGIC);
    writeUint32BE(output, 4, totalLength);

    let offset = 8;
    for (const chunk of chunks) {
      writeFourCC(output, offset, chunk.type);
      writeUint32BE(output, offset + 4, chunk.bytes.length + 8);
      output.set(chunk.bytes, offset + 8);
      offset += 8 + chunk.bytes.length;
    }

    return output;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const baseName = inputFile.name.split(".")[0];
      let bytes: Uint8Array;

      if (inputFormat.internal === "icns" && outputFormat.internal === "png") {
        bytes = extractBestPngFromIcns(inputFile.bytes);
      } else if (inputFormat.internal === "png" && outputFormat.internal === "icns") {
        bytes = await this.#encodeIcns(new Uint8Array(inputFile.bytes));
      } else {
        throw `Unsupported conversion: ${inputFormat.internal} -> ${outputFormat.internal}`;
      }

      outputFiles.push({
        bytes,
        name: `${baseName}.${outputFormat.extension}`
      });
    }

    return outputFiles;
  }

}

export default icnsHandler;
