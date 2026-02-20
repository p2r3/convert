// file: src/handlers/stl.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "../CommonFormats.ts";
import { parseSTL } from "@amandaghassaei/stl-parser";

// 1024x1024 heightmap
const HEIGHTMAP_WIDTH = 1024;
const HEIGHTMAP_HEIGHT = 1024;

class stlHandler implements FormatHandler {
  public name: string = "stl";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init() {
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
        lossless: true,
      },

      // PNG heightmap (existing route)
      CommonFormats.PNG.builder("png")
        .named("PNG heightmap")
        .allowFrom(false)
        .allowTo(true)
        .markLossless(),

      // NEW: STL -> OBJ route
      {
        name: "Wavefront OBJ 3D Model",
        format: "obj",
        extension: "obj",
        mime: "model/obj",
        from: false,
        to: true,
        internal: "obj",
        category: ["3d"],
        lossless: true,
      },
    ];
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const first = inputFiles[0];

    // Parse STL (binary or ASCII)
    const arrayBuffer = toArrayBuffer(first.bytes);
    const mesh = parseSTL(arrayBuffer as any) as any;

    const vertices: Float32Array | number[] = mesh.vertices;
    const boundingBox = mesh.boundingBox;

    const outNameBase = first.name.replace(/\.stl$/i, "");

    // If the user wants OBJ, do STL -> OBJ export
    if (outputFormat.internal === "obj" || outputFormat.format === "obj") {
      const objText = stlMeshToOBJ(vertices);
      const encoder = new TextEncoder();
      const objBytes = encoder.encode(objText);

      const out: FileData = {
        name: outNameBase + ".obj",
        bytes: objBytes,
      };

      return [out];
    }

    // Otherwise, default to STL -> PNG heightmap (existing behavior)

    if (
      !vertices ||
      vertices.length === 0 ||
      !boundingBox ||
      !Array.isArray(boundingBox.min) ||
      !Array.isArray(boundingBox.max)
    ) {
      // No geometry; return a blank PNG
      const blankHeights = new Float32Array(HEIGHTMAP_WIDTH * HEIGHTMAP_HEIGHT);
      const pixels = heightsToPixels(blankHeights, HEIGHTMAP_WIDTH, HEIGHTMAP_HEIGHT);
      const pngBytes = await encodePng(pixels, HEIGHTMAP_WIDTH, HEIGHTMAP_HEIGHT);

      return [
        {
          name: outNameBase + "-heightmap.png",
          bytes: pngBytes,
        },
      ];
    }

    const width = HEIGHTMAP_WIDTH;
    const height = HEIGHTMAP_HEIGHT;

    // 1) Vertex-based heightmap
    const rawHeights = buildHeightmapFromVertices(vertices, boundingBox, width, height);

    // 2) Tiny blur to smooth aliasing / holes
    const smoothedHeights = boxBlurHeightmap(rawHeights, width, height);

    // 3) Normalize and build grayscale pixels
    const pixels = heightsToPixels(smoothedHeights, width, height);

    // 4) Encode PNG via canvas
    const pngBytes = await encodePng(pixels, width, height);

    const out: FileData = {
      name: outNameBase + "-heightmap.png",
      bytes: pngBytes,
    };

    return [out];
  }
}

export default stlHandler;

/**
 * Convert FileData.bytes to ArrayBuffer in a TS-safe, type-agnostic way.
 */
function toArrayBuffer(bytes: any): ArrayBuffer {
  if (bytes instanceof Uint8Array) {
    if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
      return bytes.buffer as ArrayBuffer;
    }
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
  }

  if (ArrayBuffer.isView(bytes)) {
    const view = bytes as ArrayBufferView;
    const copy = new Uint8Array(view.byteLength);
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return copy.buffer;
  }

  // Last resort: assume it's already ArrayBuffer-like
  return bytes as ArrayBuffer;
}

/**
 * Convert an STL mesh (as a flat vertex array) into a simple OBJ string.
 *
 * We assume triangles in order: every 3 vertices is one triangle.
 * That’s totally fine for printing / editing in Shapr3D, Blender, etc.
 */
function stlMeshToOBJ(vertices: Float32Array | number[]): string {
  if (!vertices || vertices.length === 0) {
    return "# empty STL -> OBJ\n";
  }

  const vCount = vertices.length / 3;

  let lines: string[] = [];
  lines.push("# STL -> OBJ export");
  lines.push("# vertices: " + vCount.toString());

  // Write vertices
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i + 0] as number;
    const y = vertices[i + 1] as number;
    const z = vertices[i + 2] as number;
    lines.push(`v ${x} ${y} ${z}`);
  }

  // Write faces (1-based indices, 3 verts per face)
  const triCount = Math.floor(vCount / 3);
  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3 + 1;
    const i1 = t * 3 + 2;
    const i2 = t * 3 + 3;
    lines.push(`f ${i0} ${i1} ${i2}`);
  }

  lines.push(""); // trailing newline
  return lines.join("\n");
}

/**
 * Original “vertex splat” style: project vertices to grid and keep max height.
 * This preserves the original Z values (normalized per model).
 */
function buildHeightmapFromVertices(
  vertices: Float32Array | number[],
  boundingBox: { min: [number, number, number]; max: [number, number, number] },
  width: number,
  height: number
): Float32Array {
  const heights = new Float32Array(width * height);
  heights.fill(0);

  const min = boundingBox.min;
  const max = boundingBox.max;

  const sizeX = max[0] - min[0] || 1;
  const sizeY = max[1] - min[1] || 1;
  const sizeZ = max[2] - min[2] || 1;

  // Slight splat radius to avoid holes but not blur too much
  const radius = 1;

  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i + 0] as number;
    const y = vertices[i + 1] as number;
    const z = vertices[i + 2] as number;

    const nx = (x - min[0]) / sizeX; // 0..1
    const ny = (y - min[1]) / sizeY; // 0..1
    const nz = (z - min[2]) / sizeZ; // 0..1

    const px = nx * (width - 1);
    const py = ny * (height - 1);

    const baseX = Math.floor(px);
    const baseY = Math.floor(py);

    for (let dy = -radius; dy <= radius; dy++) {
      const yy = baseY + dy;
      if (yy < 0 || yy >= height) continue;

      for (let dx = -radius; dx <= radius; dx++) {
        const xx = baseX + dx;
        if (xx < 0 || xx >= width) continue;

        const idx = yy * width + xx;
        if (nz > heights[idx]) heights[idx] = nz;
      }
    }
  }

  return heights;
}

/**
 * Tiny 3x3 box blur to smooth aliasing without destroying detail.
 */
function boxBlurHeightmap(
  src: Float32Array,
  width: number,
  height: number
): Float32Array {
  const out = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;

        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;

          sum += src[yy * width + xx];
          count++;
        }
      }

      out[y * width + x] = count > 0 ? sum / count : src[y * width + x];
    }
  }

  return out;
}

/**
 * Normalize heights 0..1 into 0..255 grayscale RGBA.
 */
function heightsToPixels(
  heights: Float32Array,
  width: number,
  height: number
): Uint8ClampedArray {
  let minH = Infinity;
  let maxH = -Infinity;

  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    if (!Number.isFinite(h)) continue;
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
  }

  if (!Number.isFinite(minH) || !Number.isFinite(maxH) || minH === maxH) {
    minH = 0;
    maxH = 1;
  }

  const range = maxH - minH || 1;
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    const t = (h - minH) / range; // 0..1
    const tClamped = Math.max(0, Math.min(1, t));
    const v = Math.round(tClamped * 255);

    const p = i * 4;
    pixels[p + 0] = v;
    pixels[p + 1] = v;
    pixels[p + 2] = v;
    pixels[p + 3] = 255;
  }

  return pixels;
}

/**
 * Encode RGBA pixels as PNG using canvas/OffscreenCanvas.
 */
async function encodePng(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Promise<Uint8Array> {
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;

  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext("2d");
  } else {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    canvas = c;
    ctx = c.getContext("2d");
  }

  if (!ctx) throw new Error("2D canvas context not available for PNG encoding");

  // TS is annoying about ImageData's overloads; cast through any
  const imgData = new (ImageData as any)(pixels, width, height);
  ctx.putImageData(imgData, 0, 0);

  let blob: Blob;
  if (canvas instanceof OffscreenCanvas) {
    blob = await (canvas as any).convertToBlob({ type: "image/png" });
  } else {
    blob = await new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/png"
      );
    });
  }

  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}
