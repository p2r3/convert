import * as pako from "pako";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt } from "src/common/index.ts";

async function revertCgBIBuffer(input: Uint8Array | ArrayBuffer): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);

  const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== PNG_SIGNATURE[i]) {
      throw new Error("Not a PNG file");
    }
  }

  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const concat = (arrays: Uint8Array[]) => {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  };

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  const crc32 = (data: Uint8Array, crc = 0xffffffff) => {
    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc & 0xff) ^ data[i]];
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const ignoreChunkTypes = new Set(["CgBI", "iDOT"]);
  const chunks: { length: number; type: string; data: Uint8Array; crc: number }[] = [];
  let offset = 8;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let isIphoneCompressed = false;
  let idatCgbiData = new Uint8Array(0);
  let width = 0,
    height = 0;

  while (offset < buffer.length) {
    const length = view.getUint32(offset, false);
    offset += 4;

    const typeBytes = buffer.slice(offset, offset + 4);
    const type = String.fromCharCode(...typeBytes);
    offset += 4;

    const data = buffer.slice(offset, offset + length);
    offset += length;

    const crc = view.getUint32(offset, false);
    offset += 4;

    if (type === "CgBI") {
      isIphoneCompressed = true;
    }

    if (ignoreChunkTypes.has(type)) {
      continue;
    }

    if (type === "IHDR") {
      const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = dataView.getUint32(0, false);
      height = dataView.getUint32(4, false);
    }

    if (type === "IDAT" && isIphoneCompressed) {
      idatCgbiData = concat([idatCgbiData, data]);
      continue;
    }

    if (type === "IEND" && isIphoneCompressed) {
      const uncompressed = pako.inflateRaw(idatCgbiData);

      const stride = width * 4;
      const newData = new Uint8Array((stride + 1) * height);
      const prev = new Uint8Array(stride);
      const row = new Uint8Array(stride);
      for (let y = 0; y < height; y++) {
        const inStart = y * (stride + 1);
        const filter = uncompressed[inStart];
        for (let x = 0; x < stride; x++) {
          const raw = uncompressed[inStart + 1 + x] ?? 0;
          const left = x >= 4 ? row[x - 4] : 0;
          const up = prev[x];
          const upLeft = x >= 4 ? prev[x - 4] : 0;
          let predictor = 0;
          if (filter === 1) predictor = left;
          else if (filter === 2) predictor = up;
          else if (filter === 3) predictor = (left + up) >> 1;
          else if (filter === 4) {
            const p = left + up - upLeft;
            const pa = Math.abs(p - left);
            const pb = Math.abs(p - up);
            const pc = Math.abs(p - upLeft);
            predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          }
          row[x] = (raw + predictor) & 0xff;
        }

        const outStart = y * (stride + 1);
        newData[outStart] = 0; // filter: none
        for (let x = 0; x < stride; x += 4) {
          const a = row[x + 3];
          const unpremultiply = (c: number) =>
            a === 0 ? 0 : Math.min(255, Math.round((c * 255) / a));
          newData[outStart + 1 + x] = unpremultiply(row[x + 2]); // B → R
          newData[outStart + 2 + x] = unpremultiply(row[x + 1]); // G
          newData[outStart + 3 + x] = unpremultiply(row[x]); // R → B
          newData[outStart + 4 + x] = a;
        }
        prev.set(row);
      }

      const compressedIdat = pako.deflate(newData);
      const typeIdat = new Uint8Array([73, 68, 65, 84]); // "IDAT"
      const combined = concat([typeIdat, compressedIdat]);
      const newCrc = crc32(combined);

      chunks.push({
        length: compressedIdat.length,
        type: "IDAT",
        data: compressedIdat,
        crc: newCrc,
      });
    }

    chunks.push({ length, type, data, crc });
  }

  const header = buffer.slice(0, 8);
  const parts: Uint8Array[] = [header];

  for (const chunk of chunks) {
    const lenBuf = new Uint8Array(4);
    new DataView(lenBuf.buffer).setUint32(0, chunk.length, false);
    parts.push(lenBuf);

    const typeBuf = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
      typeBuf[i] = chunk.type.charCodeAt(i);
    }
    parts.push(typeBuf);

    if (chunk.length > 0) {
      parts.push(chunk.data);
    }

    const crcBuf = new Uint8Array(4);
    new DataView(crcBuf.buffer).setUint32(0, chunk.crc, false);
    parts.push(crcBuf);
  }

  return concat(parts);
}

class cgbiToPngHandler implements FormatHandler {
  public readonly name = "cgbiToPng";
  public supportedFormats = [
    Formats.CGBI_PNG.builder("cgbi-png").lossless().from(),
    Formats.PNG.builder("png").lossless().to(),
  ];
  public ready = false;

  async init(): Promise<void> {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (inputFormat.internal !== "cgbi-png" || outputFormat.internal !== "png") {
      throw new TypeError(
        `Unsupported conversion: ${inputFormat.internal} → ${outputFormat.internal}`,
      );
    }

    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      try {
        const standardPng = await revertCgBIBuffer(inputFile.bytes);

        const outputName = changeExt(inputFile.name, outputFormat.extension);

        outputFiles.push({
          bytes: standardPng,
          name: outputName,
        });
      } catch (error) {
        throw new Error(
          `Failed to convert ${inputFile.name}: ${error instanceof Error ? error.message : String(error)}`,
          {
            cause: error,
          },
        );
      }
    }

    return outputFiles;
  }
}

export default cgbiToPngHandler;
