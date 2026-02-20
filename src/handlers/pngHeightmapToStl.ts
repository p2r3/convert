// file: pngHeightmapToStl.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "../CommonFormats.ts";

const MAX_SIZE = 1024; // clamp very big images down for sanity

class pngHeightmapToStlHandler implements FormatHandler {
  public name: string = "png-heightmap-to-stl";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init() {
    this.supportedFormats = [
      // Input: PNG heightmap
      CommonFormats.PNG.builder("heightmap-png")
        .named("PNG Heightmap")
        .allowFrom(true)
        .allowTo(false),

      // Output: STL mesh
      {
        name: "STL 3D Model",
        format: "stl",
        extension: "stl",
        mime: "model/stl",
        from: false,
        to: true,
        internal: "stl",
        category: ["3d"],
        lossless: false, // lossy: image → mesh
      },
    ];
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat
  ): Promise<FileData[]> {
    const first = inputFiles[0];

    // FileData.bytes can be weirdly typed; let decodePng normalize it.
    const { width, height, data } = await decodePng(first.bytes as unknown as ArrayBufferLike);

    const { w: scaledW, h: scaledH, pixels } = maybeScaleImage(width, height, data);

    const heights = imageToHeights(pixels, scaledW, scaledH);

    const stlBytes = heightmapToBinaryStl(heights, scaledW, scaledH);

    const outNameBase = first.name.replace(/\.(png|jpg|jpeg|webp)$/i, "");
    const out: FileData = {
      name: outNameBase + "-heightmap.stl",
      bytes: stlBytes,
    };

    return [out];
  }
}

export default pngHeightmapToStlHandler;

/**
 * Decode PNG bytes into RGBA image data using canvas / ImageBitmap.
 *
 * We take anything ArrayBuffer-like, immediately copy it into a fresh Uint8Array
 * backed by ArrayBuffer, and only then give it to Blob.
 */
async function decodePng(
  bytes: ArrayBufferLike
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  // Hard copy into a brand-new Uint8Array backed by ArrayBuffer
  const src = new Uint8Array(bytes);
  const u8 = new Uint8Array(src.byteLength);
  u8.set(src);

  const blob = new Blob([u8], { type: "image/png" });
  const bitmap = await createImageBitmap(blob);

  let canvas: OffscreenCanvas | HTMLCanvasElement;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;

  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    ctx = canvas.getContext("2d");
  } else {
    const c = document.createElement("canvas");
    c.width = bitmap.width;
    c.height = bitmap.height;
    canvas = c;
    ctx = c.getContext("2d");
  }

  if (!ctx) throw new Error("Cannot get 2D context for PNG decode");

  const ctx2d = ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  ctx2d.drawImage(bitmap, 0, 0);
  const imgData = ctx2d.getImageData(0, 0, bitmap.width, bitmap.height);

  return {
    width: imgData.width,
    height: imgData.height,
    data: imgData.data,
  };
}

/**
 * Optionally downscale large images to max MAX_SIZE.
 */
function maybeScaleImage(
  width: number,
  height: number,
  data: Uint8ClampedArray
): { w: number; h: number; pixels: Uint8ClampedArray } {
  const maxSide = Math.max(width, height);
  if (maxSide <= MAX_SIZE) {
    // Already small enough, but make sure data is a “plain” Uint8ClampedArray
    const copy = new Uint8ClampedArray(data.byteLength);
    copy.set(data);
    return { w: width, h: height, pixels: copy };
  }

  const scale = MAX_SIZE / maxSide;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  let canvas: OffscreenCanvas | HTMLCanvasElement;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;

  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(w, h);
    ctx = canvas.getContext("2d");
  } else {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    canvas = c;
    ctx = c.getContext("2d");
  }

  if (!ctx) {
    const fallback = new Uint8ClampedArray(data.byteLength);
    fallback.set(data);
    return { w: width, h: height, pixels: fallback };
  }

  const srcCanvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : (() => {
          const c = document.createElement("canvas");
          c.width = width;
          c.height = height;
          return c;
        })();

  const srcCtxRaw = srcCanvas.getContext("2d");
  if (!srcCtxRaw) {
    const fallback = new Uint8ClampedArray(data.byteLength);
    fallback.set(data);
    return { w: width, h: height, pixels: fallback };
  }

  const srcCtx = srcCtxRaw as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  // VERY explicit: build a fresh Uint8ClampedArray on a real ArrayBuffer
  const pixelCopy = new Uint8ClampedArray(data.byteLength);
  pixelCopy.set(data);

  // Here we call ImageData with (data, sw, sh) so TypeScript sees it as the 3‑arg overload
  const srcImg = new ImageData(pixelCopy as unknown as ImageData["data"], width, height);

  srcCtx.putImageData(srcImg, 0, 0);

  const ctx2d = ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx2d.drawImage(srcCanvas as any, 0, 0, w, h);

  const scaledImg = ctx2d.getImageData(0, 0, w, h);

  return { w, h, pixels: scaledImg.data };
}

/**
 * Turn RGBA pixels into a height field (0..1) using luminance.
 */
function imageToHeights(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Float32Array {
  const heights = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4 + 0];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b; // 0..255
    heights[i] = lum / 255; // 0..1
  }

  return heights;
}

/**
 * Convert a heightmap into a binary STL terrain mesh.
 * X,Y in [0,1], Z = height * heightScale.
 */
function heightmapToBinaryStl(
  heights: Float32Array,
  width: number,
  height: number
): Uint8Array {
  const heightScale = 1.0;
  const triCount = (width - 1) * (height - 1) * 2;

  const headerBytes = 80;
  const countBytes = 4;
  const triBytes = 50; // 12 floats + 2-byte attribute

  const buffer = new ArrayBuffer(headerBytes + countBytes + triCount * triBytes);
  const view = new DataView(buffer);

  let offset = headerBytes;

  view.setUint32(offset, triCount, true);
  offset += 4;

  function index(x: number, y: number): number {
    return y * width + x;
  }

  function vertex(x: number, y: number): { x: number; y: number; z: number } {
    const u = x / (width - 1);
    const v = y / (height - 1);
    const h = heights[index(x, y)] * heightScale;
    return { x: u, y: v, z: h };
  }

  let triIndex = 0;

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const v00 = vertex(x, y);
      const v10 = vertex(x + 1, y);
      const v01 = vertex(x, y + 1);
      const v11 = vertex(x + 1, y + 1);

      writeTriangle(view, offset + triIndex * triBytes, v00, v10, v01);
      triIndex++;

      writeTriangle(view, offset + triIndex * triBytes, v10, v11, v01);
      triIndex++;
    }
  }

  return new Uint8Array(buffer);
}

/**
 * Compute normal and write one triangle into STL buffer.
 */
function writeTriangle(
  view: DataView,
  offset: number,
  v0: { x: number; y: number; z: number },
  v1: { x: number; y: number; z: number },
  v2: { x: number; y: number; z: number }
) {
  const ux = v1.x - v0.x;
  const uy = v1.y - v0.y;
  const uz = v1.z - v0.z;
  const vx = v2.x - v0.x;
  const vy = v2.y - v0.y;
  const vz = v2.z - v0.z;

  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;

  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;

  view.setFloat32(offset + 0, nx, true);
  view.setFloat32(offset + 4, ny, true);
  view.setFloat32(offset + 8, nz, true);

  view.setFloat32(offset + 12, v0.x, true);
  view.setFloat32(offset + 16, v0.y, true);
  view.setFloat32(offset + 20, v0.z, true);

  view.setFloat32(offset + 24, v1.x, true);
  view.setFloat32(offset + 28, v1.y, true);
  view.setFloat32(offset + 32, v1.z, true);

  view.setFloat32(offset + 36, v2.x, true);
  view.setFloat32(offset + 40, v2.y, true);
  view.setFloat32(offset + 44, v2.z, true);

  view.setUint16(offset + 48, 0, true);
}
