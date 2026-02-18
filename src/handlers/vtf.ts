import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

const TEXTUREFLAGS_ENVMAP = 0x00004000;
const RESOURCE_HIGH_RES_IMAGE = 0x30;

const VTF_IMAGE_FORMAT = {
  NONE: -1,
  RGBA8888: 0,
  ABGR8888: 1,
  RGB888: 2,
  BGR888: 3,
  RGB565: 4,
  I8: 5,
  IA88: 6,
  P8: 7,
  A8: 8,
  RGB888_BLUESCREEN: 9,
  BGR888_BLUESCREEN: 10,
  ARGB8888: 11,
  BGRA8888: 12,
  DXT1: 13,
  DXT3: 14,
  DXT5: 15,
  BGRX8888: 16,
  BGR565: 17,
  BGRX5551: 18,
  BGRA4444: 19,
  DXT1_ONEBITALPHA: 20,
  BGRA5551: 21,
  UV88: 22,
  UVWQ8888: 23,
  RGBA16161616F: 24,
  RGBA16161616: 25,
  UVLX8888: 26,
  R32F: 27,
  RGB323232F: 28,
  RGBA32323232F: 29,
  NV_DST16: 30,
  NV_DST24: 31,
  NV_INTZ: 32,
  NV_RAWZ: 33,
  ATI_DST16: 34,
  ATI_DST24: 35,
  NV_NULL: 36,
  ATI2N: 37,
  ATI1N: 38,
  RGBA1010102: 39,
  BGRA1010102: 40,
  R16F: 41,
  D16: 42,
  D15S1: 43,
  D24S8: 44,
  LINEAR_BGRX8888: 45,
  LINEAR_RGBA8888: 46
} as const;

type VTFImageFormat = typeof VTF_IMAGE_FORMAT[keyof typeof VTF_IMAGE_FORMAT];

interface VTFHeader {
  versionMajor: number;
  versionMinor: number;
  headerSize: number;
  width: number;
  height: number;
  flags: number;
  frames: number;
  firstFrame: number;
  imageFormat: VTFImageFormat;
  mipmapCount: number;
  lowResImageFormat: VTFImageFormat;
  lowResWidth: number;
  lowResHeight: number;
  depth: number;
  resourceCount: number;
}

interface DecodedImage {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

function versionAtLeast (header: VTFHeader, major: number, minor: number): boolean {
  if (header.versionMajor !== major) return header.versionMajor > major;
  return header.versionMinor >= minor;
}

function parseHeader (bytes: Uint8Array): VTFHeader {
  if (bytes.length < 64) throw "Input is too small for a VTF file.";
  if (
    bytes[0] !== 0x56 || // V
    bytes[1] !== 0x54 || // T
    bytes[2] !== 0x46 || // F
    bytes[3] !== 0x00
  ) throw "Invalid VTF signature.";

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = view.getUint32(12, true);
  if (headerSize < 64 || headerSize > bytes.length) throw "Invalid VTF header size.";

  const width = view.getUint16(16, true);
  const height = view.getUint16(18, true);
  if (width === 0 || height === 0) throw "Invalid VTF image dimensions.";

  const versionMajor = view.getUint32(4, true);
  const versionMinor = view.getUint32(8, true);

  let depth = 1;
  if (
    (versionMajor > 7 || (versionMajor === 7 && versionMinor >= 2))
    && bytes.length >= 65
  ) {
    depth = Math.max(1, view.getUint16(63, true));
  }

  let resourceCount = 0;
  if (
    (versionMajor > 7 || (versionMajor === 7 && versionMinor >= 3))
    && bytes.length >= 72
  ) {
    resourceCount = view.getUint32(68, true);
    if (resourceCount > 4096) resourceCount = 0;
  }

  return {
    versionMajor,
    versionMinor,
    headerSize,
    width,
    height,
    flags: view.getUint32(20, true),
    frames: Math.max(1, view.getUint16(24, true)),
    firstFrame: view.getUint16(26, true),
    imageFormat: view.getInt32(52, true) as VTFImageFormat,
    mipmapCount: Math.max(1, bytes[56]),
    lowResImageFormat: view.getInt32(57, true) as VTFImageFormat,
    lowResWidth: bytes[61],
    lowResHeight: bytes[62],
    depth,
    resourceCount
  };
}

function getMipDimension (size: number, level: number): number {
  return Math.max(1, size >> level);
}

function getFaces (flags: number): number {
  return (flags & TEXTUREFLAGS_ENVMAP) ? 6 : 1;
}

function getBytesPerPixel (format: VTFImageFormat): number | null {
  switch (format) {
    case VTF_IMAGE_FORMAT.RGBA8888:
    case VTF_IMAGE_FORMAT.ABGR8888:
    case VTF_IMAGE_FORMAT.ARGB8888:
    case VTF_IMAGE_FORMAT.BGRA8888:
    case VTF_IMAGE_FORMAT.BGRX8888:
    case VTF_IMAGE_FORMAT.UVWQ8888:
    case VTF_IMAGE_FORMAT.UVLX8888:
    case VTF_IMAGE_FORMAT.RGBA1010102:
    case VTF_IMAGE_FORMAT.BGRA1010102:
    case VTF_IMAGE_FORMAT.LINEAR_BGRX8888:
    case VTF_IMAGE_FORMAT.LINEAR_RGBA8888:
      return 4;
    case VTF_IMAGE_FORMAT.RGB888:
    case VTF_IMAGE_FORMAT.BGR888:
    case VTF_IMAGE_FORMAT.RGB888_BLUESCREEN:
    case VTF_IMAGE_FORMAT.BGR888_BLUESCREEN:
      return 3;
    case VTF_IMAGE_FORMAT.RGB565:
    case VTF_IMAGE_FORMAT.BGR565:
    case VTF_IMAGE_FORMAT.BGRX5551:
    case VTF_IMAGE_FORMAT.BGRA4444:
    case VTF_IMAGE_FORMAT.BGRA5551:
    case VTF_IMAGE_FORMAT.IA88:
    case VTF_IMAGE_FORMAT.UV88:
      return 2;
    case VTF_IMAGE_FORMAT.I8:
    case VTF_IMAGE_FORMAT.A8:
      return 1;
    default:
      return null;
  }
}

function getImageDataSize (format: VTFImageFormat, width: number, height: number): number {
  if (
    format === VTF_IMAGE_FORMAT.DXT1 ||
    format === VTF_IMAGE_FORMAT.DXT1_ONEBITALPHA ||
    format === VTF_IMAGE_FORMAT.ATI1N
  ) {
    const blocksWide = Math.max(1, Math.ceil(width / 4));
    const blocksHigh = Math.max(1, Math.ceil(height / 4));
    return blocksWide * blocksHigh * 8;
  }

  if (
    format === VTF_IMAGE_FORMAT.DXT3 ||
    format === VTF_IMAGE_FORMAT.DXT5 ||
    format === VTF_IMAGE_FORMAT.ATI2N
  ) {
    const blocksWide = Math.max(1, Math.ceil(width / 4));
    const blocksHigh = Math.max(1, Math.ceil(height / 4));
    return blocksWide * blocksHigh * 16;
  }

  const bytesPerPixel = getBytesPerPixel(format);
  if (bytesPerPixel === null) {
    throw `Unsupported VTF image format: ${format}.`;
  }
  return width * height * bytesPerPixel;
}

function getLowResSize (header: VTFHeader): number {
  if (
    header.lowResImageFormat === VTF_IMAGE_FORMAT.NONE ||
    header.lowResWidth === 0 ||
    header.lowResHeight === 0
  ) return 0;
  return getImageDataSize(header.lowResImageFormat, header.lowResWidth, header.lowResHeight);
}

function findHighResDataOffset (bytes: Uint8Array, header: VTFHeader): number {
  const fallback = header.headerSize + getLowResSize(header);
  if (!versionAtLeast(header, 7, 3) || header.resourceCount <= 0) {
    return fallback;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const resourceCount = header.resourceCount;
  const starts = Array.from(new Set([
    80,
    header.headerSize - (resourceCount * 8),
    header.headerSize
  ]));

  for (const start of starts) {
    if (start < 0 || start + (resourceCount * 8) > bytes.length) continue;
    for (let i = 0; i < resourceCount; i++) {
      const entryOffset = start + (i * 8);
      if (
        bytes[entryOffset] === RESOURCE_HIGH_RES_IMAGE &&
        bytes[entryOffset + 1] === 0x00 &&
        bytes[entryOffset + 2] === 0x00
      ) {
        const dataOffset = view.getUint32(entryOffset + 4, true);
        if (dataOffset < bytes.length) return dataOffset;
      }
    }
  }

  return fallback;
}

function unpack565 (value: number): [number, number, number] {
  const r = Math.round((((value >> 11) & 0x1F) * 255) / 31);
  const g = Math.round((((value >> 5) & 0x3F) * 255) / 63);
  const b = Math.round(((value & 0x1F) * 255) / 31);
  return [r, g, b];
}

function writePixel (
  out: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number
) {
  if (x < 0 || y < 0 || x >= width) return;
  const index = ((y * width) + x) * 4;
  if (index < 0 || index + 3 >= out.length) return;
  out[index] = r;
  out[index + 1] = g;
  out[index + 2] = b;
  out[index + 3] = a;
}

function decodeDxt1 (
  data: Uint8Array,
  width: number,
  height: number,
  oneBitAlpha: boolean
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const blocksWide = Math.max(1, Math.ceil(width / 4));
  const blocksHigh = Math.max(1, Math.ceil(height / 4));

  for (let by = 0; by < blocksHigh; by++) {
    for (let bx = 0; bx < blocksWide; bx++) {
      const blockOffset = (by * blocksWide + bx) * 8;
      const color0 = view.getUint16(blockOffset, true);
      const color1 = view.getUint16(blockOffset + 2, true);
      const selectors = view.getUint32(blockOffset + 4, true);

      const c0 = unpack565(color0);
      const c1 = unpack565(color1);
      const palette: Array<[number, number, number, number]> = [
        [c0[0], c0[1], c0[2], 255],
        [c1[0], c1[1], c1[2], 255],
        [0, 0, 0, 255],
        [0, 0, 0, 255]
      ];

      const useTransparent = oneBitAlpha && color0 <= color1;
      if (useTransparent) {
        palette[2] = [
          Math.round((c0[0] + c1[0]) / 2),
          Math.round((c0[1] + c1[1]) / 2),
          Math.round((c0[2] + c1[2]) / 2),
          255
        ];
        palette[3] = [0, 0, 0, 0];
      } else {
        palette[2] = [
          Math.round(((2 * c0[0]) + c1[0]) / 3),
          Math.round(((2 * c0[1]) + c1[1]) / 3),
          Math.round(((2 * c0[2]) + c1[2]) / 3),
          255
        ];
        palette[3] = [
          Math.round((c0[0] + (2 * c1[0])) / 3),
          Math.round((c0[1] + (2 * c1[1])) / 3),
          Math.round((c0[2] + (2 * c1[2])) / 3),
          255
        ];
      }

      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const selectorShift = 2 * ((py * 4) + px);
          const paletteIndex = (selectors >> selectorShift) & 0x3;
          const color = palette[paletteIndex];
          const x = (bx * 4) + px;
          const y = (by * 4) + py;
          if (x >= width || y >= height) continue;
          writePixel(out, width, x, y, color[0], color[1], color[2], color[3]);
        }
      }
    }
  }

  return out;
}

function decodeDxtColorBlock (
  block: Uint8Array,
  blockOffset: number
): Array<[number, number, number]> {
  const view = new DataView(block.buffer, block.byteOffset + blockOffset, 8);
  const color0 = view.getUint16(0, true);
  const color1 = view.getUint16(2, true);
  const c0 = unpack565(color0);
  const c1 = unpack565(color1);
  return [
    [c0[0], c0[1], c0[2]],
    [c1[0], c1[1], c1[2]],
    [
      Math.round(((2 * c0[0]) + c1[0]) / 3),
      Math.round(((2 * c0[1]) + c1[1]) / 3),
      Math.round(((2 * c0[2]) + c1[2]) / 3)
    ],
    [
      Math.round((c0[0] + (2 * c1[0])) / 3),
      Math.round((c0[1] + (2 * c1[1])) / 3),
      Math.round((c0[2] + (2 * c1[2])) / 3)
    ]
  ];
}

function decodeDxt3 (data: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const blocksWide = Math.max(1, Math.ceil(width / 4));
  const blocksHigh = Math.max(1, Math.ceil(height / 4));

  for (let by = 0; by < blocksHigh; by++) {
    for (let bx = 0; bx < blocksWide; bx++) {
      const blockOffset = (by * blocksWide + bx) * 16;
      const colors = decodeDxtColorBlock(data, blockOffset + 8);
      const selectors = new DataView(
        data.buffer,
        data.byteOffset + blockOffset + 12,
        4
      ).getUint32(0, true);

      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const pixelIndex = (py * 4) + px;
          const alphaByte = data[blockOffset + (pixelIndex >> 1)];
          const alphaNibble = (pixelIndex & 1) === 0 ? (alphaByte & 0x0F) : (alphaByte >> 4);
          const alpha = alphaNibble * 17;

          const selector = (selectors >> (2 * pixelIndex)) & 0x3;
          const color = colors[selector];
          const x = (bx * 4) + px;
          const y = (by * 4) + py;
          if (x >= width || y >= height) continue;
          writePixel(out, width, x, y, color[0], color[1], color[2], alpha);
        }
      }
    }
  }

  return out;
}

function decodeDxt5AlphaBlock (block: Uint8Array, blockOffset: number): Uint8Array {
  const out = new Uint8Array(16);
  const alpha0 = block[blockOffset];
  const alpha1 = block[blockOffset + 1];

  const table = new Uint8Array(8);
  table[0] = alpha0;
  table[1] = alpha1;
  if (alpha0 > alpha1) {
    table[2] = Math.round(((6 * alpha0) + alpha1) / 7);
    table[3] = Math.round(((5 * alpha0) + (2 * alpha1)) / 7);
    table[4] = Math.round(((4 * alpha0) + (3 * alpha1)) / 7);
    table[5] = Math.round(((3 * alpha0) + (4 * alpha1)) / 7);
    table[6] = Math.round(((2 * alpha0) + (5 * alpha1)) / 7);
    table[7] = Math.round((alpha0 + (6 * alpha1)) / 7);
  } else {
    table[2] = Math.round(((4 * alpha0) + alpha1) / 5);
    table[3] = Math.round(((3 * alpha0) + (2 * alpha1)) / 5);
    table[4] = Math.round(((2 * alpha0) + (3 * alpha1)) / 5);
    table[5] = Math.round((alpha0 + (4 * alpha1)) / 5);
    table[6] = 0;
    table[7] = 255;
  }

  let bits = 0n;
  for (let i = 0; i < 6; i++) {
    bits |= BigInt(block[blockOffset + 2 + i]) << BigInt(8 * i);
  }

  for (let i = 0; i < 16; i++) {
    const index = Number((bits >> BigInt(3 * i)) & 0x7n);
    out[i] = table[index];
  }

  return out;
}

function decodeDxt5 (data: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const blocksWide = Math.max(1, Math.ceil(width / 4));
  const blocksHigh = Math.max(1, Math.ceil(height / 4));

  for (let by = 0; by < blocksHigh; by++) {
    for (let bx = 0; bx < blocksWide; bx++) {
      const blockOffset = (by * blocksWide + bx) * 16;
      const alpha = decodeDxt5AlphaBlock(data, blockOffset);
      const colors = decodeDxtColorBlock(data, blockOffset + 8);
      const selectors = new DataView(
        data.buffer,
        data.byteOffset + blockOffset + 12,
        4
      ).getUint32(0, true);

      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const pixelIndex = (py * 4) + px;
          const selector = (selectors >> (2 * pixelIndex)) & 0x3;
          const color = colors[selector];
          const x = (bx * 4) + px;
          const y = (by * 4) + py;
          if (x >= width || y >= height) continue;
          writePixel(out, width, x, y, color[0], color[1], color[2], alpha[pixelIndex]);
        }
      }
    }
  }

  return out;
}

function decodeAti1N (data: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const blocksWide = Math.max(1, Math.ceil(width / 4));
  const blocksHigh = Math.max(1, Math.ceil(height / 4));

  for (let by = 0; by < blocksHigh; by++) {
    for (let bx = 0; bx < blocksWide; bx++) {
      const blockOffset = (by * blocksWide + bx) * 8;
      const red = decodeDxt5AlphaBlock(data, blockOffset);
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const pixelIndex = (py * 4) + px;
          const x = (bx * 4) + px;
          const y = (by * 4) + py;
          if (x >= width || y >= height) continue;
          const value = red[pixelIndex];
          writePixel(out, width, x, y, value, value, value, 255);
        }
      }
    }
  }

  return out;
}

function decodeAti2N (data: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const blocksWide = Math.max(1, Math.ceil(width / 4));
  const blocksHigh = Math.max(1, Math.ceil(height / 4));

  for (let by = 0; by < blocksHigh; by++) {
    for (let bx = 0; bx < blocksWide; bx++) {
      const blockOffset = (by * blocksWide + bx) * 16;
      const red = decodeDxt5AlphaBlock(data, blockOffset);
      const green = decodeDxt5AlphaBlock(data, blockOffset + 8);
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const pixelIndex = (py * 4) + px;
          const x = (bx * 4) + px;
          const y = (by * 4) + py;
          if (x >= width || y >= height) continue;
          writePixel(out, width, x, y, red[pixelIndex], green[pixelIndex], 255, 255);
        }
      }
    }
  }

  return out;
}

function decodeUncompressed (
  data: Uint8Array,
  width: number,
  height: number,
  format: VTFImageFormat
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i++) {
    const inOffset4 = i * 4;
    const inOffset3 = i * 3;
    const inOffset2 = i * 2;
    const outOffset = i * 4;

    switch (format) {
      case VTF_IMAGE_FORMAT.RGBA8888:
      case VTF_IMAGE_FORMAT.LINEAR_RGBA8888:
        out[outOffset] = data[inOffset4];
        out[outOffset + 1] = data[inOffset4 + 1];
        out[outOffset + 2] = data[inOffset4 + 2];
        out[outOffset + 3] = data[inOffset4 + 3];
        break;
      case VTF_IMAGE_FORMAT.ABGR8888:
        out[outOffset] = data[inOffset4 + 3];
        out[outOffset + 1] = data[inOffset4 + 2];
        out[outOffset + 2] = data[inOffset4 + 1];
        out[outOffset + 3] = data[inOffset4];
        break;
      case VTF_IMAGE_FORMAT.ARGB8888:
        out[outOffset] = data[inOffset4 + 1];
        out[outOffset + 1] = data[inOffset4 + 2];
        out[outOffset + 2] = data[inOffset4 + 3];
        out[outOffset + 3] = data[inOffset4];
        break;
      case VTF_IMAGE_FORMAT.BGRA8888:
        out[outOffset] = data[inOffset4 + 2];
        out[outOffset + 1] = data[inOffset4 + 1];
        out[outOffset + 2] = data[inOffset4];
        out[outOffset + 3] = data[inOffset4 + 3];
        break;
      case VTF_IMAGE_FORMAT.BGRX8888:
      case VTF_IMAGE_FORMAT.LINEAR_BGRX8888:
        out[outOffset] = data[inOffset4 + 2];
        out[outOffset + 1] = data[inOffset4 + 1];
        out[outOffset + 2] = data[inOffset4];
        out[outOffset + 3] = 255;
        break;
      case VTF_IMAGE_FORMAT.RGB888:
        out[outOffset] = data[inOffset3];
        out[outOffset + 1] = data[inOffset3 + 1];
        out[outOffset + 2] = data[inOffset3 + 2];
        out[outOffset + 3] = 255;
        break;
      case VTF_IMAGE_FORMAT.BGR888:
        out[outOffset] = data[inOffset3 + 2];
        out[outOffset + 1] = data[inOffset3 + 1];
        out[outOffset + 2] = data[inOffset3];
        out[outOffset + 3] = 255;
        break;
      case VTF_IMAGE_FORMAT.RGB888_BLUESCREEN: {
        const r = data[inOffset3];
        const g = data[inOffset3 + 1];
        const b = data[inOffset3 + 2];
        out[outOffset] = r;
        out[outOffset + 1] = g;
        out[outOffset + 2] = b;
        out[outOffset + 3] = (r === 0 && g === 0 && b === 255) ? 0 : 255;
        break;
      }
      case VTF_IMAGE_FORMAT.BGR888_BLUESCREEN: {
        const r = data[inOffset3 + 2];
        const g = data[inOffset3 + 1];
        const b = data[inOffset3];
        out[outOffset] = r;
        out[outOffset + 1] = g;
        out[outOffset + 2] = b;
        out[outOffset + 3] = (r === 0 && g === 0 && b === 255) ? 0 : 255;
        break;
      }
      case VTF_IMAGE_FORMAT.RGB565: {
        const packed = view.getUint16(inOffset2, true);
        const [r, g, b] = unpack565(packed);
        out[outOffset] = r;
        out[outOffset + 1] = g;
        out[outOffset + 2] = b;
        out[outOffset + 3] = 255;
        break;
      }
      case VTF_IMAGE_FORMAT.BGR565: {
        const packed = view.getUint16(inOffset2, true);
        const b = Math.round((((packed >> 11) & 0x1F) * 255) / 31);
        const g = Math.round((((packed >> 5) & 0x3F) * 255) / 63);
        const r = Math.round(((packed & 0x1F) * 255) / 31);
        out[outOffset] = r;
        out[outOffset + 1] = g;
        out[outOffset + 2] = b;
        out[outOffset + 3] = 255;
        break;
      }
      case VTF_IMAGE_FORMAT.BGRX5551: {
        const packed = view.getUint16(inOffset2, true);
        const b = Math.round((((packed >> 11) & 0x1F) * 255) / 31);
        const g = Math.round((((packed >> 6) & 0x1F) * 255) / 31);
        const r = Math.round((((packed >> 1) & 0x1F) * 255) / 31);
        out[outOffset] = r;
        out[outOffset + 1] = g;
        out[outOffset + 2] = b;
        out[outOffset + 3] = 255;
        break;
      }
      case VTF_IMAGE_FORMAT.BGRA5551: {
        const packed = view.getUint16(inOffset2, true);
        const b = Math.round((((packed >> 11) & 0x1F) * 255) / 31);
        const g = Math.round((((packed >> 6) & 0x1F) * 255) / 31);
        const r = Math.round((((packed >> 1) & 0x1F) * 255) / 31);
        const a = (packed & 0x1) ? 255 : 0;
        out[outOffset] = r;
        out[outOffset + 1] = g;
        out[outOffset + 2] = b;
        out[outOffset + 3] = a;
        break;
      }
      case VTF_IMAGE_FORMAT.BGRA4444: {
        const packed = view.getUint16(inOffset2, true);
        const b = ((packed >> 12) & 0x0F) * 17;
        const g = ((packed >> 8) & 0x0F) * 17;
        const r = ((packed >> 4) & 0x0F) * 17;
        const a = (packed & 0x0F) * 17;
        out[outOffset] = r;
        out[outOffset + 1] = g;
        out[outOffset + 2] = b;
        out[outOffset + 3] = a;
        break;
      }
      case VTF_IMAGE_FORMAT.I8: {
        const value = data[i];
        out[outOffset] = value;
        out[outOffset + 1] = value;
        out[outOffset + 2] = value;
        out[outOffset + 3] = 255;
        break;
      }
      case VTF_IMAGE_FORMAT.A8:
        out[outOffset] = 255;
        out[outOffset + 1] = 255;
        out[outOffset + 2] = 255;
        out[outOffset + 3] = data[i];
        break;
      case VTF_IMAGE_FORMAT.IA88: {
        const intensity = data[inOffset2];
        out[outOffset] = intensity;
        out[outOffset + 1] = intensity;
        out[outOffset + 2] = intensity;
        out[outOffset + 3] = data[inOffset2 + 1];
        break;
      }
      case VTF_IMAGE_FORMAT.UV88:
        out[outOffset] = data[inOffset2];
        out[outOffset + 1] = data[inOffset2 + 1];
        out[outOffset + 2] = 255;
        out[outOffset + 3] = 255;
        break;
      case VTF_IMAGE_FORMAT.UVWQ8888:
        out[outOffset] = data[inOffset4];
        out[outOffset + 1] = data[inOffset4 + 1];
        out[outOffset + 2] = data[inOffset4 + 2];
        out[outOffset + 3] = data[inOffset4 + 3];
        break;
      case VTF_IMAGE_FORMAT.UVLX8888:
        out[outOffset] = data[inOffset4];
        out[outOffset + 1] = data[inOffset4 + 1];
        out[outOffset + 2] = data[inOffset4 + 2];
        out[outOffset + 3] = 255;
        break;
      case VTF_IMAGE_FORMAT.RGBA1010102: {
        const packed = view.getUint32(inOffset4, true);
        out[outOffset] = Math.round(((packed & 0x3FF) * 255) / 1023);
        out[outOffset + 1] = Math.round((((packed >> 10) & 0x3FF) * 255) / 1023);
        out[outOffset + 2] = Math.round((((packed >> 20) & 0x3FF) * 255) / 1023);
        out[outOffset + 3] = ((packed >> 30) & 0x3) * 85;
        break;
      }
      case VTF_IMAGE_FORMAT.BGRA1010102: {
        const packed = view.getUint32(inOffset4, true);
        out[outOffset] = Math.round((((packed >> 20) & 0x3FF) * 255) / 1023);
        out[outOffset + 1] = Math.round((((packed >> 10) & 0x3FF) * 255) / 1023);
        out[outOffset + 2] = Math.round(((packed & 0x3FF) * 255) / 1023);
        out[outOffset + 3] = ((packed >> 30) & 0x3) * 85;
        break;
      }
      default:
        throw `Unsupported VTF image format: ${format}.`;
    }
  }

  return out;
}

function decodeSurface (
  data: Uint8Array,
  width: number,
  height: number,
  format: VTFImageFormat
): Uint8ClampedArray {
  switch (format) {
    case VTF_IMAGE_FORMAT.DXT1:
      return decodeDxt1(data, width, height, false);
    case VTF_IMAGE_FORMAT.DXT1_ONEBITALPHA:
      return decodeDxt1(data, width, height, true);
    case VTF_IMAGE_FORMAT.DXT3:
      return decodeDxt3(data, width, height);
    case VTF_IMAGE_FORMAT.DXT5:
      return decodeDxt5(data, width, height);
    case VTF_IMAGE_FORMAT.ATI1N:
      return decodeAti1N(data, width, height);
    case VTF_IMAGE_FORMAT.ATI2N:
      return decodeAti2N(data, width, height);
    default:
      return decodeUncompressed(data, width, height, format);
  }
}

function decodeVTF (bytes: Uint8Array): DecodedImage {
  const header = parseHeader(bytes);
  const highResOffset = findHighResDataOffset(bytes, header);
  const faces = getFaces(header.flags);
  const topDepth = Math.max(1, header.depth);

  const frameIndex = (
    header.firstFrame >= header.frames || header.firstFrame === 0xFFFF
      ? 0
      : header.firstFrame
  );

  const topImageSize = getImageDataSize(header.imageFormat, header.width, header.height);

  let prefixBytesSmallToLarge = 0;
  for (let level = header.mipmapCount - 1; level > 0; level--) {
    const mipWidth = getMipDimension(header.width, level);
    const mipHeight = getMipDimension(header.height, level);
    const mipDepth = getMipDimension(header.depth, level);
    const mipImageSize = getImageDataSize(header.imageFormat, mipWidth, mipHeight);
    prefixBytesSmallToLarge += mipImageSize * header.frames * faces * mipDepth;
  }

  const imageIndex = frameIndex * faces * topDepth;
  const candidateOffsets = [
    highResOffset + prefixBytesSmallToLarge + (imageIndex * topImageSize),
    highResOffset + (imageIndex * topImageSize)
  ];

  let chosenOffset: number | null = null;
  for (const candidate of candidateOffsets) {
    if (candidate >= 0 && candidate + topImageSize <= bytes.length) {
      chosenOffset = candidate;
      break;
    }
  }
  if (chosenOffset === null) throw "VTF image data is truncated.";

  const surface = bytes.subarray(chosenOffset, chosenOffset + topImageSize);
  const pixels = decodeSurface(surface, header.width, header.height, header.imageFormat);
  return { width: header.width, height: header.height, pixels };
}

class vtfHandler implements FormatHandler {

  public name: string = "vtf";

  public supportedFormats: FileFormat[] = [
    {
      name: "Valve Texture Format",
      format: "vtf",
      extension: "vtf",
      mime: "image/x-vtf",
      from: true,
      to: false,
      internal: "vtf",
      category: "image"
    },
    CommonFormats.PNG.supported("png", false, true, true),
    CommonFormats.JPEG.supported("jpeg", false, true),
    CommonFormats.WEBP.supported("webp", false, true)
  ];

  #canvas?: HTMLCanvasElement;
  #ctx?: CanvasRenderingContext2D;

  public ready: boolean = false;

  async init () {
    this.#canvas = document.createElement("canvas");
    this.#ctx = this.#canvas.getContext("2d") || undefined;
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (!this.#canvas || !this.#ctx) throw "Handler not initialized.";

    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      const decoded = decodeVTF(inputFile.bytes);
      this.#canvas.width = decoded.width;
      this.#canvas.height = decoded.height;
      const imageData = new ImageData(new Uint8ClampedArray(decoded.pixels), decoded.width, decoded.height);
      this.#ctx.putImageData(imageData, 0, 0);

      const bytes: Uint8Array = await new Promise((resolve, reject) => {
        this.#canvas!.toBlob((blob) => {
          if (!blob) return reject("Canvas output failed");
          blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
        }, outputFormat.mime);
      });
      const name = inputFile.name.split(".")[0] + "." + outputFormat.extension;
      outputFiles.push({ bytes, name });
    }
    return outputFiles;
  }

}

export default vtfHandler;
