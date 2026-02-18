import pako from "pako";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

async function revertCgBIBuffer(input: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);

  const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== PNG_SIGNATURE[i]) {
      throw "Not a PNG file";
    }
  }

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
  let width = 0, height = 0;

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

      const newData = new Uint8Array(uncompressed.length);
      let i = 0;
      for (let y = 0; y < height; y++) {
        newData[i] = uncompressed[i]; // filter byte
        i++;
        for (let x = 0; x < width; x++) {
          newData[i]     = uncompressed[i + 2]; // B → R
          newData[i + 1] = uncompressed[i + 1]; // G
          newData[i + 2] = uncompressed[i];     // R → B
          newData[i + 3] = uncompressed[i + 3]; // A
          i += 4;
        }
      }

      const compressedIdat = pako.deflate(newData);
      const typeIdat = new Uint8Array([73, 68, 65, 84]); // "IDAT"
      const combined = concat([typeIdat, compressedIdat]);
      const newCrc = crc32(combined);

      chunks.push({
        length: compressedIdat.length,
        type: "IDAT",
        data: compressedIdat,
        crc: newCrc
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

class CgbiToPngHandler implements FormatHandler {
  public name = "CgBI to PNG converter";
  public ready = true;

  public supportedFormats: FileFormat[] = [
    {
      name: "CgBI PNG (iPhone optimized)",
      format: "cgbi-png",
      extension: "png",
      mime: "image/png-cgbi", // Should include "image/png" in the name to appear in suggested formats 
      from: true,
      to: false,
      internal: "cgbi-png"
    },
    {
      name: "Portable Network Graphics",
      format: "png",
      extension: "png",
      mime: "image/png",
      from: false,
      to: true,
      internal: "png"
    }
  ];

  async init(): Promise<void> {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    _args?: string[]
  ): Promise<FileData[]> {
    if (inputFormat.internal !== "cgbi-png" || outputFormat.internal !== "png") {
      throw `Unsupported conversion: ${inputFormat.internal} → ${outputFormat.internal}`;
    }

    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      try {
        const standardPng = await revertCgBIBuffer(inputFile.bytes);

        const baseName = inputFile.name.replace(/\.[^/.]+$/, "");
        const outputName = `${baseName}.${outputFormat.extension}`;

        outputFiles.push({
          bytes: standardPng,
          name: outputName
        });
      } catch (error) {
        throw `Failed to convert ${inputFile.name}: ${(error as Error).message}`;
      }
    }

    return outputFiles;
  }
}

export default CgbiToPngHandler;