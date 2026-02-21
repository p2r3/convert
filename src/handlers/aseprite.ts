import pako from "pako";
import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

const ASEPRITE_HEADER_MAGIC = 0xA5E0;
const ASEPRITE_FRAME_MAGIC = 0xF1FA;
const CHUNK_TYPE_LAYER = 0x2004;
const CHUNK_TYPE_CEL = 0x2005;
const CHUNK_TYPE_PALETTE = 0x2019;
const CHUNK_TYPE_PALETTE_LEGACY_8BIT = 0x0004;
const CHUNK_TYPE_PALETTE_LEGACY_6BIT = 0x0011;

interface LayerInfo {
  visible: boolean;
  opacity: number;
  blendMode: number;
}

interface CelImage {
  width: number;
  height: number;
  x: number;
  y: number;
  layerIndex: number;
  opacity: number;
  pixels: Uint8Array;
}

interface ParsedAseprite {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4; break;
  }
  h /= 6;
  return { h, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3),
    g: hue2rgb(p, q, h),
    b: hue2rgb(p, q, h - 1 / 3)
  };
}

function readStringLE(bytes: Uint8Array, offset: number): { value: string; next: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint16(offset, true);
  const start = offset + 2;
  const end = start + length;
  const value = new TextDecoder().decode(bytes.subarray(start, end));
  return { value, next: end };
}

function decodeAseprite(bytes: Uint8Array): ParsedAseprite {
  if (bytes.length < 128) throw "File is too small to be a valid .aseprite file.";

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint16(4, true);
  if (magic !== ASEPRITE_HEADER_MAGIC) throw "Invalid Aseprite header magic.";

  const frameCount = view.getUint16(6, true);
  const width = view.getUint16(8, true);
  const height = view.getUint16(10, true);
  const colorDepth = view.getUint16(12, true);
  const transparentPaletteIndex = bytes[28] ?? 0;
  if (width === 0 || height === 0) throw "Invalid image dimensions in Aseprite file.";
  if (frameCount === 0) throw "Aseprite file has no frames.";
  if (colorDepth !== 32 && colorDepth !== 16 && colorDepth !== 8) {
    throw "Unsupported Aseprite color depth. Expected RGBA(32), Grayscale(16), or Indexed(8).";
  }

  const layers: LayerInfo[] = [];
  const frameCels = new Map<number, Map<number, CelImage>>();
  const palette = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    palette[(i * 4) + 3] = 255;
  }
  palette[(transparentPaletteIndex * 4) + 3] = 0;
  const unsupportedCelTypes = new Set<number>();

  let offset = 128;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    if (offset + 16 > bytes.length) throw "Unexpected end of file while reading frame header.";
    const frameBytes = view.getUint32(offset, true);
    const frameMagic = view.getUint16(offset + 4, true);
    if (frameMagic !== ASEPRITE_FRAME_MAGIC) throw "Invalid frame magic in Aseprite file.";

    const oldChunkCount = view.getUint16(offset + 6, true);
    const chunkCountValue = view.getUint32(offset + 12, true);
    const chunkCount = chunkCountValue === 0 ? oldChunkCount : chunkCountValue;
    const frameEnd = offset + frameBytes;
    let chunkOffset = offset + 16;

    const currentFrameCels = new Map<number, CelImage>();

    for (let i = 0; i < chunkCount; i++) {
      if (chunkOffset + 6 > bytes.length) throw "Unexpected end of file while reading chunk header.";
      const chunkSize = view.getUint32(chunkOffset, true);
      const chunkType = view.getUint16(chunkOffset + 4, true);
      const chunkDataStart = chunkOffset + 6;
      const chunkEnd = chunkOffset + chunkSize;
      if (chunkSize < 6 || chunkEnd > bytes.length || chunkEnd > frameEnd) throw "Invalid chunk size in Aseprite file.";

      if (chunkType === CHUNK_TYPE_LAYER) {
        const flags = view.getUint16(chunkDataStart, true);
        const blendMode = view.getUint16(chunkDataStart + 10, true);
        const opacity = bytes[chunkDataStart + 12];
        readStringLE(bytes, chunkDataStart + 16);
        layers.push({
          visible: (flags & 1) !== 0,
          opacity,
          blendMode
        });
      } else if (chunkType === CHUNK_TYPE_PALETTE) {
        const firstColor = view.getUint32(chunkDataStart + 4, true);
        const lastColor = view.getUint32(chunkDataStart + 8, true);
        let entryOffset = chunkDataStart + 20;
        for (let colorIndex = firstColor; colorIndex <= lastColor && colorIndex < 256; colorIndex++) {
          const flags = view.getUint16(entryOffset, true);
          const r = bytes[entryOffset + 2];
          const g = bytes[entryOffset + 3];
          const b = bytes[entryOffset + 4];
          const a = bytes[entryOffset + 5];
          const p = colorIndex * 4;
          palette[p] = r;
          palette[p + 1] = g;
          palette[p + 2] = b;
          palette[p + 3] = a;
          entryOffset += 6;
          if ((flags & 1) !== 0) {
            const parsed = readStringLE(bytes, entryOffset);
            entryOffset = parsed.next;
          }
        }
      } else if (chunkType === CHUNK_TYPE_PALETTE_LEGACY_8BIT || chunkType === CHUNK_TYPE_PALETTE_LEGACY_6BIT) {
        const packetCount = view.getUint16(chunkDataStart, true);
        const isSixBit = chunkType === CHUNK_TYPE_PALETTE_LEGACY_6BIT;
        let paletteIndex = 0;
        let entryOffset = chunkDataStart + 2;
        for (let packet = 0; packet < packetCount && entryOffset + 2 <= chunkEnd; packet++) {
          const skip = bytes[entryOffset];
          let colorCount = bytes[entryOffset + 1];
          entryOffset += 2;
          if (colorCount === 0) colorCount = 256;
          paletteIndex += skip;
          for (let c = 0; c < colorCount && paletteIndex < 256 && entryOffset + 3 <= chunkEnd; c++) {
            const r = bytes[entryOffset];
            const g = bytes[entryOffset + 1];
            const b = bytes[entryOffset + 2];
            entryOffset += 3;

            const p = paletteIndex * 4;
            palette[p] = isSixBit ? Math.round((r * 255) / 63) : r;
            palette[p + 1] = isSixBit ? Math.round((g * 255) / 63) : g;
            palette[p + 2] = isSixBit ? Math.round((b * 255) / 63) : b;
            if (paletteIndex !== transparentPaletteIndex) palette[p + 3] = 255;
            paletteIndex++;
          }
        }
      } else if (chunkType === CHUNK_TYPE_CEL) {
        const layerIndex = view.getUint16(chunkDataStart, true);
        const x = view.getInt16(chunkDataStart + 2, true);
        const y = view.getInt16(chunkDataStart + 4, true);
        const celOpacity = bytes[chunkDataStart + 6];
        const celType = view.getUint16(chunkDataStart + 7, true);

        if (celType === 1) {
          const linkedFrame = view.getUint16(chunkDataStart + 16, true);
          const linked = frameCels.get(linkedFrame)?.get(layerIndex);
          if (linked) {
            currentFrameCels.set(layerIndex, {
              ...linked,
              x,
              y,
              opacity: celOpacity
            });
          }
        } else if (celType === 0 || celType === 2) {
          const celWidth = view.getUint16(chunkDataStart + 16, true);
          const celHeight = view.getUint16(chunkDataStart + 18, true);
          const dataStart = chunkDataStart + 20;

          const bytesPerPixel = colorDepth === 32 ? 4 : (colorDepth === 16 ? 2 : 1);
          const expectedByteLength = celWidth * celHeight * bytesPerPixel;
          let celBytes: Uint8Array;
          if (celType === 0) {
            const rawEnd = dataStart + expectedByteLength;
            if (rawEnd > chunkEnd) throw "Invalid raw cel data length.";
            celBytes = bytes.subarray(dataStart, rawEnd);
          } else {
            const compressed = bytes.subarray(dataStart, chunkEnd);
            celBytes = pako.inflate(compressed);
            if (celBytes.length !== expectedByteLength) throw "Invalid decompressed cel size.";
          }

          const pixelData = new Uint8Array(celWidth * celHeight * 4);
          if (colorDepth === 32) {
            pixelData.set(celBytes);
          } else if (colorDepth === 16) {
            for (let k = 0; k < celWidth * celHeight; k++) {
              const gray = celBytes[k * 2];
              const alpha = celBytes[k * 2 + 1];
              const p = k * 4;
              pixelData[p] = gray;
              pixelData[p + 1] = gray;
              pixelData[p + 2] = gray;
              pixelData[p + 3] = alpha;
            }
          } else {
            for (let k = 0; k < celWidth * celHeight; k++) {
              const index = celBytes[k];
              const pp = index * 4;
              const p = k * 4;
              pixelData[p] = palette[pp];
              pixelData[p + 1] = palette[pp + 1];
              pixelData[p + 2] = palette[pp + 2];
              pixelData[p + 3] = palette[pp + 3];
            }
          }

          currentFrameCels.set(layerIndex, {
            width: celWidth,
            height: celHeight,
            x,
            y,
            layerIndex,
            opacity: celOpacity,
            pixels: new Uint8Array(pixelData)
          });
        } else {
          unsupportedCelTypes.add(celType);
        }
      }

      chunkOffset = chunkEnd;
    }

    if (chunkOffset > frameEnd) throw "Frame chunk data exceeds frame bounds.";
    frameCels.set(frameIndex, currentFrameCels);
    offset = frameEnd;
  }

  let targetFrame = frameCels.get(0);
  if (!targetFrame || targetFrame.size === 0) {
    for (let i = 0; i < frameCount; i++) {
      const frame = frameCels.get(i);
      if (frame && frame.size > 0) {
        targetFrame = frame;
        break;
      }
    }
  }
  if (!targetFrame) throw "Failed to read first frame.";
  if (targetFrame.size === 0) {
    if (unsupportedCelTypes.size > 0) {
      throw `Unsupported Aseprite cel type(s): ${Array.from(unsupportedCelTypes).join(", ")}.`;
    }
    throw "Aseprite frame has no drawable cels.";
  }

  const output = new Uint8ClampedArray(width * height * 4);

  const layerEntries = Array.from(targetFrame.values()).sort((a, b) => a.layerIndex - b.layerIndex);
  for (const cel of layerEntries) {
    const layer = layers[cel.layerIndex];
    if (layer && !layer.visible) continue;
    const layerOpacity = (layer?.opacity ?? 255) / 255;
    const blendMode = layer?.blendMode ?? 0;
    const celOpacity = cel.opacity / 255;

    for (let py = 0; py < cel.height; py++) {
      const dy = cel.y + py;
      if (dy < 0 || dy >= height) continue;

      for (let px = 0; px < cel.width; px++) {
        const dx = cel.x + px;
        if (dx < 0 || dx >= width) continue;

        const srcIndex = (py * cel.width + px) * 4;
        const dstIndex = (dy * width + dx) * 4;

        const srcR = cel.pixels[srcIndex] / 255;
        const srcG = cel.pixels[srcIndex + 1] / 255;
        const srcB = cel.pixels[srcIndex + 2] / 255;
        const srcAlpha = (cel.pixels[srcIndex + 3] / 255) * celOpacity * layerOpacity;

        if (srcAlpha <= 0) continue;

        const dstR = output[dstIndex] / 255;
        const dstG = output[dstIndex + 1] / 255;
        const dstB = output[dstIndex + 2] / 255;
        const dstAlpha = output[dstIndex + 3] / 255;

        const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
        if (outAlpha <= 0) continue;

        const blend = (mode: number, s: number, d: number, srgb: { r: number; g: number; b: number }, drgb: { r: number; g: number; b: number }, channel: "r" | "g" | "b"): number => {
          switch (mode) {
            case 1: return s * d; // multiply
            case 2: return 1 - ((1 - s) * (1 - d)); // screen
            case 3: return d <= 0.5 ? 2 * s * d : 1 - (2 * (1 - s) * (1 - d)); // overlay
            case 4: return Math.min(s, d); // darken
            case 5: return Math.max(s, d); // lighten
            case 6: return s >= 1 ? 1 : Math.min(1, d / (1 - s)); // color dodge
            case 7: return s <= 0 ? 0 : 1 - Math.min(1, (1 - d) / s); // color burn
            case 8: return s <= 0.5 ? 2 * s * d : 1 - (2 * (1 - s) * (1 - d)); // hard light
            case 9: { // soft light
              if (s <= 0.5) return d - (1 - 2 * s) * d * (1 - d);
              const g = d <= 0.25 ? (((16 * d - 12) * d + 4) * d) : Math.sqrt(d);
              return d + (2 * s - 1) * (g - d);
            }
            case 10: return Math.abs(d - s); // difference
            case 11: return s + d - (2 * s * d); // exclusion
            case 12: { // hue
              const shsl = rgbToHsl(srgb.r, srgb.g, srgb.b);
              const dhsl = rgbToHsl(drgb.r, drgb.g, drgb.b);
              const out = hslToRgb(shsl.h, dhsl.s, dhsl.l);
              return out[channel];
            }
            case 13: { // saturation
              const shsl = rgbToHsl(srgb.r, srgb.g, srgb.b);
              const dhsl = rgbToHsl(drgb.r, drgb.g, drgb.b);
              const out = hslToRgb(dhsl.h, shsl.s, dhsl.l);
              return out[channel];
            }
            case 14: { // color
              const shsl = rgbToHsl(srgb.r, srgb.g, srgb.b);
              const dhsl = rgbToHsl(drgb.r, drgb.g, drgb.b);
              const out = hslToRgb(shsl.h, shsl.s, dhsl.l);
              return out[channel];
            }
            case 15: { // luminosity
              const shsl = rgbToHsl(srgb.r, srgb.g, srgb.b);
              const dhsl = rgbToHsl(drgb.r, drgb.g, drgb.b);
              const out = hslToRgb(dhsl.h, dhsl.s, shsl.l);
              return out[channel];
            }
            case 16: return Math.min(1, s + d); // addition
            case 17: return Math.max(0, d - s); // subtract
            case 18: return s === 0 ? 1 : Math.min(1, d / s); // divide
            default: return s; // normal and unsupported modes
          }
        };

        const srcRgb = { r: srcR, g: srcG, b: srcB };
        const dstRgb = { r: dstR, g: dstG, b: dstB };
        const blendedR = clamp01(blend(blendMode, srcR, dstR, srcRgb, dstRgb, "r"));
        const blendedG = clamp01(blend(blendMode, srcG, dstG, srcRgb, dstRgb, "g"));
        const blendedB = clamp01(blend(blendMode, srcB, dstB, srcRgb, dstRgb, "b"));

        const outR = (
          ((1 - srcAlpha) * dstAlpha * dstR)
          + (srcAlpha * (1 - dstAlpha) * srcR)
          + (srcAlpha * dstAlpha * blendedR)
        ) / outAlpha;
        const outG = (
          ((1 - srcAlpha) * dstAlpha * dstG)
          + (srcAlpha * (1 - dstAlpha) * srcG)
          + (srcAlpha * dstAlpha * blendedG)
        ) / outAlpha;
        const outB = (
          ((1 - srcAlpha) * dstAlpha * dstB)
          + (srcAlpha * (1 - dstAlpha) * srcB)
          + (srcAlpha * dstAlpha * blendedB)
        ) / outAlpha;

        output[dstIndex] = Math.round(Math.min(1, Math.max(0, outR)) * 255);
        output[dstIndex + 1] = Math.round(Math.min(1, Math.max(0, outG)) * 255);
        output[dstIndex + 2] = Math.round(Math.min(1, Math.max(0, outB)) * 255);
        output[dstIndex + 3] = Math.round(outAlpha * 255);
      }
    }
  }

  return { width, height, pixels: output };
}

class asepriteHandler implements FormatHandler {
  public name: string = "aseprite";
  public supportedFormats: FileFormat[] = [
    {
      name: "Aseprite Sprite",
      format: "aseprite",
      extension: "aseprite",
      mime: "image/x-aseprite",
      from: true,
      to: false,
      internal: "aseprite",
      category: "image",
      lossless: true
    },
    CommonFormats.PNG.supported("png", false, true, true),
    CommonFormats.JPEG.supported("jpeg", false, true),
    CommonFormats.WEBP.supported("webp", false, true)
  ];

  #canvas?: HTMLCanvasElement;
  #ctx?: CanvasRenderingContext2D;
  public ready: boolean = false;

  async init() {
    this.#canvas = document.createElement("canvas");
    this.#ctx = this.#canvas.getContext("2d") || undefined;
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (!this.#canvas || !this.#ctx) throw "Handler not initialized.";

    const outputs: FileData[] = [];
    for (const inputFile of inputFiles) {
      const decoded = decodeAseprite(inputFile.bytes);
      this.#canvas.width = decoded.width;
      this.#canvas.height = decoded.height;

      const imagePixels = new Uint8ClampedArray(decoded.pixels.length);
      imagePixels.set(decoded.pixels);
      const imageData = new ImageData(imagePixels, decoded.width, decoded.height);
      this.#ctx.putImageData(imageData, 0, 0);

      const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        this.#canvas!.toBlob(blob => {
          if (!blob) return reject("Canvas failed to encode output image.");
          blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
        }, outputFormat.mime);
      });

      const baseName = inputFile.name.includes(".")
        ? inputFile.name.slice(0, inputFile.name.lastIndexOf("."))
        : inputFile.name;
      outputs.push({
        bytes,
        name: `${baseName}.${outputFormat.extension}`
      });
    }

    return outputs;
  }
}

export default asepriteHandler;
