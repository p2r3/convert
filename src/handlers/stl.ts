// file: stl.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "../CommonFormats.ts";
import { parseSTL } from "@amandaghassaei/stl-parser";

function makeHeightmapPNG(
  width: number,
  height: number,
  heights: number[]
): Uint8Array {
  const rowSize = 1 + width * 3;
  const raw = new Uint8Array(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const h = Math.max(0, Math.min(1, heights[idx] ?? 0));
      const v = Math.round(h * 255);
      const pixelOffset = rowOffset + 1 + x * 3;
      raw[pixelOffset + 0] = v;
      raw[pixelOffset + 1] = v;
      raw[pixelOffset + 2] = v;
    }
  }

  function crc32(buf: Uint8Array): number {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        const mask = -(c & 1);
        c = (c >>> 1) ^ (0xEDB88320 & mask);
      }
    }
    return ~c >>> 0;
  }

  function chunk(type: string, data: Uint8Array): Uint8Array {
    const len = data.length;
    const out = new Uint8Array(8 + len + 4);
    const view = new DataView(out.buffer);
    view.setUint32(0, len);
    out[4] = type.charCodeAt(0);
    out[5] = type.charCodeAt(1);
    out[6] = type.charCodeAt(2);
    out[7] = type.charCodeAt(3);
    out.set(data, 8);
    const crcBuf = new Uint8Array(4 + len);
    crcBuf.set(out.subarray(4, 8 + len));
    const crc = crc32(crcBuf);
    view.setUint32(8 + len, crc);
    return out;
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  function adler32(buf: Uint8Array): number {
    let a = 1, d = 0;
    for (let i = 0; i < buf.length; i++) {
      a = (a + buf[i]) % 65521;
      d = (d + a) % 65521;
    }
    return (d << 16) | a;
  }

  const blockHeader = new Uint8Array(5);
  blockHeader[0] = 0x01; // BFINAL=1, BTYPE=0 (no compression)
  const len = raw.length;
  const nlen = (~len) & 0xFFFF;
  const hView = new DataView(blockHeader.buffer);
  hView.setUint16(1, len, true);
  hView.setUint16(3, nlen, true);

  const adler = adler32(raw);
  const adlerBuf = new Uint8Array(4);
  const aView = new DataView(adlerBuf.buffer);
  aView.setUint32(0, adler);

  const zlib = new Uint8Array(2 + blockHeader.length + raw.length + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  zlib.set(blockHeader, 2);
  zlib.set(raw, 2 + blockHeader.length);
  zlib.set(adlerBuf, 2 + blockHeader.length + raw.length);

  const sig = new Uint8Array([
    0x89, 0x50, 0x4E, 0x47,
    0x0D, 0x0A, 0x1A, 0x0A
  ]);

  const pngParts = [
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib),
    chunk("IEND", new Uint8Array(0)),
  ];

  let total = 0;
  for (const p of pngParts) total += p.length;
  const png = new Uint8Array(total);
  let offset = 0;
  for (const p of pngParts) {
    png.set(p, offset);
    offset += p.length;
  }
  return png;
}

class stlHandler implements FormatHandler {

  public name: string = "stl";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init () {
    this.supportedFormats = [
      {
        name: "STL 3D Model",
        format: "stl",
        extension: "stl",
        mime: "model/stl",
        from: true,
        to: false,
        internal: "stl",
        category: ["3d"],
        lossless: true
      },

      // Still a regular PNG that the rest of the pipeline understands
      CommonFormats.PNG.builder("png")
        .named("PNG")
        .allowFrom(false)
        .allowTo(true)
        .markLossless(),
    ];
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    const first = inputFiles[0];

    const mesh = parseSTL(first.bytes.buffer as ArrayBuffer);
    const { vertices, boundingBox } = mesh;

    if (!vertices || vertices.length === 0) {
      return [{
        name: first.name,
        bytes: new Uint8Array(first.bytes),
      }];
    }

    const min = boundingBox.min;
    const max = boundingBox.max;

    const sizeX = max[0] - min[0] || 1;
    const sizeY = max[1] - min[1] || 1;
    const sizeZ = max[2] - min[2] || 1;

    const width = 1024;
    const height = 1024;
    const heights = new Array(width * height).fill(0);

    // Slightly smaller splat radius so 1024x1024 doesn't get ridiculous
    const radius = 1;

    for (let i = 0; i < vertices.length; i += 9) {
      for (let v = 0; v < 3; v++) {
        const x = vertices[i + v * 3 + 0];
        const y = vertices[i + v * 3 + 1];
        const z = vertices[i + v * 3 + 2];

        const nx = (x - min[0]) / sizeX;
        const ny = (y - min[1]) / sizeY;
        const nz = (z - min[2]) / sizeZ;

        const cx = nx * (width - 1);
        const cy = ny * (height - 1);

        const baseX = Math.floor(cx);
        const baseY = Math.floor(cy);

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const px = baseX + dx;
            const py = baseY + dy;
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            const idx = py * width + px;
            if (nz > heights[idx]) heights[idx] = nz;
          }
        }
      }
    }

    const pngBytes = makeHeightmapPNG(width, height, heights);

    const outNameBase = first.name.replace(/\.stl$/i, "");
    const out: FileData = {
      name: outNameBase + "-heightmap.png",
      bytes: pngBytes,
    };

    return [out];
  }

}

export default stlHandler;
