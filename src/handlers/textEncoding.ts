import CommonFormats, { Category } from "src/CommonFormats.ts";
import type { FormatHandler, FileData, FileFormat } from "../FormatHandler.ts";

function hasPrefix(bytes: Uint8Array, prefix: number[]) {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix[i]) return false;
  return true;
}

function decodeUTF32(bytes: Uint8Array, littleEndian: boolean) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let out = "";
  for (let i = 0; i + 4 <= dv.byteLength; i += 4) {
    const cp = dv.getUint32(i, littleEndian);
    out += String.fromCodePoint(cp);
  }
  return out;
}

function decodeUTF16(bytes: Uint8Array, littleEndian: boolean) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let out = "";
  for (let i = 0; i + 2 <= dv.byteLength; ) {
    const w1 = dv.getUint16(i, littleEndian);
    i += 2;
    if (w1 >= 0xd800 && w1 <= 0xdbff && i + 2 <= dv.byteLength) {
      const w2 = dv.getUint16(i, littleEndian);
      i += 2;
      const cp = (((w1 - 0xd800) << 10) | (w2 - 0xdc00)) + 0x10000;
      out += String.fromCodePoint(cp);
    } else {
      out += String.fromCharCode(w1);
    }
  }
  return out;
}

function encodeUTF16(str: string, littleEndian: boolean, addBOM = false) {
  // count code units
  const codepoints = Array.from(str);
  // worst case 2 units per code point
  const buf = new ArrayBuffer((codepoints.length * 2 + (addBOM ? 2 : 0)));
  const dv = new DataView(buf);
  let offset = 0;
  if (addBOM) {
    dv.setUint16(0, littleEndian ? 0xFF_FE : 0xFE_FF, false);
    offset += 2;
  }
  for (const ch of codepoints) {
    const cp = ch.codePointAt(0) || 0;
    if (cp <= 0xffff) {
      dv.setUint16(offset, cp, littleEndian);
      offset += 2;
    } else {
      const v = cp - 0x10000;
      const hi = 0xd800 + (v >> 10);
      const lo = 0xdc00 + (v & 0x3ff);
      dv.setUint16(offset, hi, littleEndian);
      dv.setUint16(offset + 2, lo, littleEndian);
      offset += 4;
    }
  }
  return new Uint8Array(buf, 0, offset);
}

function encodeUTF32(str: string, littleEndian: boolean, addBOM = false) {
  const codepoints = Array.from(str, (ch) => ch.codePointAt(0) || 0);
  const buf = new ArrayBuffer(codepoints.length * 4 + (addBOM ? 4 : 0));
  const dv = new DataView(buf);
  let offset = 0;
  if (addBOM) {
    if (littleEndian) dv.setUint32(0, 0xFF_FE_00_00, true);
    else dv.setUint32(0, 0x00_00_FE_FF, false);
    offset += 4;
  }
  for (const cp of codepoints) {
    dv.setUint32(offset, cp, littleEndian);
    offset += 4;
  }
  return new Uint8Array(buf, 0, offset);
}

function decodeUsingTextDecoder(bytes: Uint8Array, label: string) {
  try {
    // TextDecoder labels are typically 'utf-8', 'utf-16le', 'utf-16be', etc.
    // Not all environments support utf-16 labels, so fall back if needed.
    const dec = new TextDecoder(label);
    return dec.decode(bytes);
  } catch {
    // fallback
    const dec = new TextDecoder("utf-8");
    return dec.decode(bytes);
  }
}

const formats: FileFormat[] = [
  CommonFormats.TEXT.supported("txt", true, true, true), // May or may not have BOM depending on browser
  { name: "Plain Text (UTF-8 without BOM)", format: "UTF-8 without BOM", extension: "txt", mime: "text/plain; charset=UTF-8 without BOM", from: false, to: true, internal: "utf8NB",  category: Category.TEXT, lossless: true }, // In case the broeser defaults to with BOM, we can choose to force BOMless UTF-8.
  { name: "Plain Text (UTF-8 with BOM)",    format: "UTF-8 with BOM",    extension: "txt", mime: "text/plain; charset=UTF-8 with BOM",    from: false, to: true, internal: "utf8WB",  category: Category.TEXT, lossless: true }, // UTF8 with forced BOM.
  { name: "Plain Text (UTF-16 LE)",         format: "UTF-16 LE",         extension: "txt", mime: "text/plain; charset=UTF-16LE",          from: true,  to: true, internal: "utf16le", category: Category.TEXT, lossless: true },
  { name: "Plain Text (UTF-16 BE)",         format: "UTF-16 BE",         extension: "txt", mime: "text/plain; charset=UTF-16BE",          from: true,  to: true, internal: "utf16be", category: Category.TEXT, lossless: true },
  { name: "Plain Text (UTF-32 LE)",         format: "UTF-32 LE",         extension: "txt", mime: "text/plain; charset=UTF-32LE",          from: true,  to: true, internal: "utf32le", category: Category.TEXT, lossless: true },
  { name: "Plain Text (UTF-32 BE)",         format: "UTF-32 BE",         extension: "txt", mime: "text/plain; charset=UTF-32BE",          from: true,  to: true, internal: "utf32be", category: Category.TEXT, lossless: true },
];

export default class TextEncodingHandler implements FormatHandler {
  name = "TextEncoding";
  supportedFormats = formats;
  ready = true;
  init = async () => { this.ready = true };

  async doConvert(inputFiles: FileData[], inputFormat: FileFormat, outputFormat: FileFormat) {
    const results: FileData[] = [];
    for (const file of inputFiles) {
      const inBytes = file.bytes;
      let text = "";

      // Determine input encoding: prefer inputFormat.internal when present
      const inf = inputFormat.internal;
      if (inf === "txt" || inf === "utf8NB") {
        text = decodeUsingTextDecoder(inBytes, "utf-8");
      } else if (inf === "utf8WB") {
        text = decodeUsingTextDecoder(inBytes.subarray(3), "utf-8");
      } else if (inf === "utf16le") {
        text = decodeUTF16(inBytes, true);
      } else if (inf === "utf16be") {
        text = decodeUTF16(inBytes, false);
      } else if (inf === "utf32le") {
        text = decodeUTF32(inBytes, true);
      } else if (inf === "utf32be") {
        text = decodeUTF32(inBytes, false);
      } else {
        // Try BOM detection
        if (hasPrefix(inBytes, [0xEF, 0xBB, 0xBF])) {
          text = decodeUsingTextDecoder(inBytes.subarray(3), "utf-8");
        } else if (hasPrefix(inBytes, [0xFF, 0xFE, 0x00, 0x00])) {
          text = decodeUTF32(inBytes.subarray(4), true);
        } else if (hasPrefix(inBytes, [0x00, 0x00, 0xFE, 0xFF])) {
          text = decodeUTF32(inBytes.subarray(4), false);
        } else if (hasPrefix(inBytes, [0xFF, 0xFE])) {
          text = decodeUTF16(inBytes.subarray(2), true);
        } else if (hasPrefix(inBytes, [0xFE, 0xFF])) {
          text = decodeUTF16(inBytes.subarray(2), false);
        } else {
          // default to utf-8
          text = decodeUsingTextDecoder(inBytes, "utf-8");
        }
      }

      // Now encode to output format
      const outf = (outputFormat && outputFormat.internal) || "utf8NB";
      let outBytes: Uint8Array;
      if (outf === "utf8NB") {
        const utf8Bytes = new TextEncoder().encode(text);
        if (utf8Bytes.length >= 3 && hasPrefix(utf8Bytes, [0xEF, 0xBB, 0xBF])) {
          // has BOM, remove it
          outBytes = utf8Bytes.subarray(3);
        } else {
          // Already without BOM, just use it as is
          outBytes = utf8Bytes;
        }
      } else if (outf === "utf8WB") {
        const utf8Bytes = new TextEncoder().encode(text);
        if (utf8Bytes.length >= 3 && hasPrefix(utf8Bytes, [0xEF, 0xBB, 0xBF])) {
          // already has BOM, don't add another
          outBytes = utf8Bytes;
        } else {
          const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
          outBytes = new Uint8Array(bom.length + utf8Bytes.length);
          outBytes.set(bom, 0);
          outBytes.set(utf8Bytes, bom.length);
        }
      } else if (outf === "utf16le") {
        outBytes = encodeUTF16(text, true, true);
      } else if (outf === "utf16be") {
        outBytes = encodeUTF16(text, false, true);
      } else if (outf === "utf32le") {
        outBytes = encodeUTF32(text, true, true);
      } else if (outf === "utf32be") {
        outBytes = encodeUTF32(text, false, true);
      } else {
        outBytes = new TextEncoder().encode(text);
      }

      results.push({ name: file.name, bytes: outBytes });
    }
    return results;
  }
}
