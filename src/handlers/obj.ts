// file: obj.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

// Simple OBJ -> STL converter.
// Supports:
// - v x y z
// - f i j k (and faces with more than 3 vertices, triangulated fan-style)

function parseOBJ(text: string): { vertices: number[][]; faces: number[][] } {
  const vertices: number[][] = [];
  const faces: number[][] = [];

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split(/\s+/);
    const tag = parts[0];

    if (tag === "v" && parts.length >= 4) {
      const x = parseFloat(parts[1]);
      const y = parseFloat(parts[2]);
      const z = parseFloat(parts[3]);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        vertices.push([x, y, z]);
      }
    } else if (tag === "f" && parts.length >= 4) {
      // OBJ faces can be like: f v1 v2 v3 or f v1/vt1/vn1 ...
      // We only care about the vertex index before the first slash.
      const indices: number[] = [];
      for (let i = 1; i < parts.length; i++) {
        const token = parts[i];
        const idxStr = token.split("/")[0];
        const idx = parseInt(idxStr, 10);
        if (!Number.isNaN(idx)) {
          // OBJ indices are 1-based; convert to 0-based
          const zeroBased = idx > 0 ? idx - 1 : vertices.length + idx;
          if (zeroBased >= 0 && zeroBased < vertices.length) {
            indices.push(zeroBased);
          }
        }
      }
      if (indices.length >= 3) {
        // Triangulate faces with more than 3 vertices using a fan
        for (let i = 1; i + 1 < indices.length; i++) {
          faces.push([indices[0], indices[i], indices[i + 1]]);
        }
      }
    }
  }

  return { vertices, faces };
}

// Binary STL writer
function writeBinarySTL(vertices: number[][], faces: number[][]): Uint8Array {
  const triangleCount = faces.length;
  const headerSize = 80;
  const triangleSize = 50; // 12 bytes normal + 36 bytes vertices + 2 bytes attribute
  const totalSize = headerSize + 4 + triangleCount * triangleSize;

  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);

  // 80-byte header (just zeros; we could put "OBJ->STL" here if we wanted)
  for (let i = 0; i < 80; i++) bytes[i] = 0;

  // Triangle count (uint32 little-endian)
  view.setUint32(80, triangleCount, true);

  let offset = headerSize + 4;

  const normal = [0, 0, 0];

  for (let i = 0; i < triangleCount; i++) {
    const [i0, i1, i2] = faces[i];
    const v0 = vertices[i0];
    const v1 = vertices[i1];
    const v2 = vertices[i2];

    if (!v0 || !v1 || !v2) continue;

    // Compute normal = normalize((v1 - v0) x (v2 - v0))
    const ux = v1[0] - v0[0];
    const uy = v1[1] - v0[1];
    const uz = v1[2] - v0[2];

    const vx = v2[0] - v0[0];
    const vy = v2[1] - v0[1];
    const vz = v2[2] - v0[2];

    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    normal[0] = nx;
    normal[1] = ny;
    normal[2] = nz;

    // Write normal (3 float32)
    view.setFloat32(offset + 0, normal[0], true);
    view.setFloat32(offset + 4, normal[1], true);
    view.setFloat32(offset + 8, normal[2], true);

    // Write vertices (3 * 3 float32)
    const vs = [v0, v1, v2];
    for (let j = 0; j < 3; j++) {
      const v = vs[j];
      view.setFloat32(offset + 12 + j * 12 + 0, v[0], true);
      view.setFloat32(offset + 12 + j * 12 + 4, v[1], true);
      view.setFloat32(offset + 12 + j * 12 + 8, v[2], true);
    }

    // Attribute byte count (uint16)
    view.setUint16(offset + 48, 0, true);

    offset += triangleSize;
  }

  return bytes;
}

class objHandler implements FormatHandler {
  public name: string = "obj";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;

  async init () {
    this.supportedFormats = [
      {
        name: "Wavefront OBJ 3D Model",
        format: "obj",
        extension: "obj",
        mime: "model/obj",
        from: true,
        to: false,
        internal: "obj",
        category: ["3d"],
        lossless: true
      },
      {
        // This must match the STL node used by your stlHandler
        name: "STL 3D Model",
        format: "stl",
        extension: "stl",
        mime: "model/stl",
        from: false,
        to: true,
        internal: "stl",
        category: ["3d"],
        lossless: true
      }
    ];
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    const first = inputFiles[0];

    // Decode OBJ text
    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(first.bytes);

    const { vertices, faces } = parseOBJ(text);

    if (vertices.length === 0 || faces.length === 0) {
      // If parsing fails, just echo the original file so the user doesn't lose it
      return [{
        name: first.name,
        bytes: new Uint8Array(first.bytes),
      }];
    }

    const stlBytes = writeBinarySTL(vertices, faces);

    const outName = first.name.replace(/\.obj$/i, "") + ".stl";

    const out: FileData = {
      name: outName,
      bytes: stlBytes,
    };

    return [out];
  }
}

export default objHandler;
