import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { FormatDefinition } from "../FormatHandler.ts";

const STL = new FormatDefinition(
  "STereoLithography (STL)",
  "stl",
  "stl",
  "application/sla",
  "data"
);

const SGX = new FormatDefinition(
  "Structured Geometry Exchange (SGX)",
  "sgx",
  "sgx",
  "application/x-sgx",
  "data"
);

function textEncode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
function textDecode(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

function readU32LE(b: Uint8Array, off: number): number {
  return (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0;
}
function readF32LE(b: Uint8Array, off: number): number {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat32(off, true);
}
function writeU32LE(dv: DataView, off: number, v: number) {
  dv.setUint32(off, v >>> 0, true);
}
function writeF32LE(dv: DataView, off: number, v: number) {
  dv.setFloat32(off, v, true);
}

function isAsciiSTL(bytes: Uint8Array): boolean {
  const head = textDecode(bytes.subarray(0, Math.min(bytes.length, 512))).toLowerCase();
  return head.includes("solid") && head.includes("facet");
}

type Tri = {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  cx: number; cy: number; cz: number;
};

function parseBinarySTL(bytes: Uint8Array): Tri[] {
  const triCount = readU32LE(bytes, 80);
  const tris: Tri[] = [];
  let off = 84;

  for (let i = 0; i < triCount; i++) {
    const ax = readF32LE(bytes, off + 12);
    const ay = readF32LE(bytes, off + 16);
    const az = readF32LE(bytes, off + 20);

    const bx = readF32LE(bytes, off + 24);
    const by = readF32LE(bytes, off + 28);
    const bz = readF32LE(bytes, off + 32);

    const cx = readF32LE(bytes, off + 36);
    const cy = readF32LE(bytes, off + 40);
    const cz = readF32LE(bytes, off + 44);

    tris.push({ ax, ay, az, bx, by, bz, cx, cy, cz });
    off += 50;
  }

  return tris;
}

function parseAsciiSTL(bytes: Uint8Array): Tri[] {
  const s = textDecode(bytes);
  const lines = s.split(/\r?\n/);
  const tris: Tri[] = [];

  let verts: Array<[number, number, number]> = [];

  for (const raw of lines) {
    const line = raw.trim().toLowerCase();
    if (line.startsWith("vertex")) {
      const p = raw.trim().split(/\s+/);
      verts.push([Number(p[1]), Number(p[2]), Number(p[3])]);
    }
    if (line.startsWith("endfacet")) {
      if (verts.length === 3) {
        const [a, b, c] = verts;
        tris.push({ ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], cx: c[0], cy: c[1], cz: c[2] });
      }
      verts = [];
    }
  }

  return tris;
}

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(0, i) : name;
}

function stlToSgx(tris: Tri[], name: string): string {
  let out = "SGX 1\n";
  out += "units mm\n";
  out += `history 01:01:1970/00:00:00 "imported from STL"\n\n`;
  out += `mesh "${name}"\n`;

  let idx = 1;
  for (const t of tris) {
    out += `v ${t.ax} ${t.ay} ${t.az}\n`;
    out += `v ${t.bx} ${t.by} ${t.bz}\n`;
    out += `v ${t.cx} ${t.cy} ${t.cz}\n`;
    out += `f ${idx} ${idx + 1} ${idx + 2}\n`;
    idx += 3;
  }

  out += "endmesh\n";
  return out;
}

function sgxToBinary(meshText: string): Uint8Array {
  const lines = meshText.split(/\r?\n/);
  const verts: Array<[number, number, number]> = [];
  const faces: Array<[number, number, number]> = [];

  for (const l of lines) {
    const line = l.trim();
    if (line.startsWith("v ")) {
      const p = line.split(/\s+/);
      verts.push([Number(p[1]), Number(p[2]), Number(p[3])]);
    }
    if (line.startsWith("f ")) {
      const p = line.split(/\s+/);
      faces.push([Number(p[1]), Number(p[2]), Number(p[3])]);
    }
  }

  const out = new Uint8Array(84 + faces.length * 50);
  const dv = new DataView(out.buffer);
  writeU32LE(dv, 80, faces.length);

  let off = 84;
  for (const f of faces) {
    const a = verts[f[0] - 1];
    const b = verts[f[1] - 1];
    const c = verts[f[2] - 1];

    writeF32LE(dv, off + 12, a[0]);
    writeF32LE(dv, off + 16, a[1]);
    writeF32LE(dv, off + 20, a[2]);

    writeF32LE(dv, off + 24, b[0]);
    writeF32LE(dv, off + 28, b[1]);
    writeF32LE(dv, off + 32, b[2]);

    writeF32LE(dv, off + 36, c[0]);
    writeF32LE(dv, off + 40, c[1]);
    writeF32LE(dv, off + 44, c[2]);

    off += 50;
  }

  return out;
}

class stltosgxHandler implements FormatHandler {
  public name = "stltosgxHandler";
  public supportedFormats?: FileFormat[];
  public ready = false;

  async init() {
    this.supportedFormats = [
      STL.builder("stl").allowFrom().allowTo().markLossless(),
      SGX.builder("sgx").allowFrom().allowTo().markLossless(),
    ];
    this.ready = true;
  }

  async doConvert(inputFiles: FileData[], inputFormat: FileFormat, outputFormat: FileFormat) {
    const out: FileData[] = [];

    for (const f of inputFiles) {
      if (inputFormat.format === "stl" && outputFormat.format === "sgx") {
        const bytes = new Uint8Array(f.bytes);
        const tris = isAsciiSTL(bytes) ? parseAsciiSTL(bytes) : parseBinarySTL(bytes);
        const sgx = stlToSgx(tris, stripExt(f.name));
        out.push({ name: `${stripExt(f.name)}.sgx`, bytes: textEncode(sgx) });
      }

      if (inputFormat.format === "sgx" && outputFormat.format === "stl") {
        const text = textDecode(new Uint8Array(f.bytes));
        const stl = sgxToBinary(text);
        out.push({ name: `${stripExt(f.name)}.stl`, bytes: stl });
      }
    }

    return out;
  }
}

export default stltosgxHandler;  
