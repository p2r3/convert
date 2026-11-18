import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt } from "src/common/index.ts";

function read_lendian(x: number, y: number): number {
  return x + y * 16 * 16;
}

function fourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

/** Walks the RIFF chunks of an .ani and returns the data of the first `icon` chunk. */
function findFirstAniIcon(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || fourCC(bytes, 0) !== "RIFF" || fourCC(bytes, 8) !== "ACON") {
    throw new Error("Not a RIFF ACON (.ani) file.");
  }
  const walk = (start: number, end: number): Uint8Array<ArrayBuffer> | null => {
    let offset = start;
    while (offset + 8 <= end) {
      const id = fourCC(bytes, offset);
      const size = view.getUint32(offset + 4, true);
      const dataStart = offset + 8;
      const dataEnd = Math.min(dataStart + size, end);
      if (id === "icon") return bytes.slice(dataStart, dataEnd);
      if (id === "LIST" && dataEnd - dataStart >= 4) {
        const found = walk(dataStart + 4, dataEnd);
        if (found) return found;
      }
      offset = dataStart + size + (size & 1);
    }
    return null;
  };
  const icon = walk(12, bytes.length);
  if (!icon) throw new Error("Couldn't find an icon frame in the .ani file.");
  return icon;
}

/** Wraps a .cur file into a single-frame .ani. */
function buildSingleFrameAni(cur: Uint8Array): Uint8Array<ArrayBuffer> {
  const pad = cur.length & 1;
  const anihSize = 36;
  const listSize = 4 + 8 + cur.length + pad; // "fram" + icon chunk
  const riffSize = 4 + (8 + anihSize) + (8 + listSize); // "ACON" + anih + LIST
  const out = new Uint8Array(8 + riffSize);
  const view = new DataView(out.buffer);
  const writeId = (offset: number, id: string) => {
    for (let i = 0; i < 4; i++) out[offset + i] = id.charCodeAt(i);
  };

  writeId(0, "RIFF");
  view.setUint32(4, riffSize, true);
  writeId(8, "ACON");
  writeId(12, "anih");
  view.setUint32(16, anihSize, true);
  view.setUint32(20, anihSize, true); // cbSize
  view.setUint32(24, 1, true); // nFrames
  view.setUint32(28, 1, true); // nSteps
  // iWidth, iHeight, iBitCount, iPlanes stay 0
  view.setUint32(48, 11, true); // iDispRate (jiffies)
  view.setUint32(52, 1, true); // flags: AF_ICON
  writeId(56, "LIST");
  view.setUint32(60, listSize, true);
  writeId(64, "fram");
  writeId(68, "icon");
  view.setUint32(72, cur.length, true);
  out.set(cur, 76);
  return out;
}

class curaniHandler implements FormatHandler {
  public readonly name = "curani";
  public supportedFormats = [
    Formats.ANI.builder("ani").fromTo(),
    Formats.CUR.builder("cur").fromTo(),
    Formats.ICO.builder("ico").fromTo(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    for (const file of inputFiles) {
      let new_file_bytes = new Uint8Array(file.bytes);

      if (inputFormat.internal === "ani") {
        // Extract the first frame of the .ani
        if (outputFormat.internal === "cur") {
          new_file_bytes = findFirstAniIcon(new_file_bytes);
        } else if (outputFormat.internal === "apng") {
          // To be added!
          throw new TypeError(`Unsupported output format: ${outputFormat.internal}`);
        } else if (outputFormat.internal === "ico") {
          throw new TypeError(
            "Refuse to convert from .ani directly to .ico; must use .cur as an intermediary.",
          );
        } else {
          throw new TypeError(`Unsupported output format: ${outputFormat.internal}`);
        }
      } else if (inputFormat.internal === "cur") {
        // Turn a static cur into a single-frame .ani
        if (outputFormat.internal === "ani") {
          new_file_bytes = buildSingleFrameAni(new_file_bytes);
        }
        // Convert a .cur into a .ico by removing hotspot and changing format header
        else if (outputFormat.internal === "ico") {
          // 1 for ICO, 2 for CUR
          new_file_bytes[2] = 1;

          const images_present = new_file_bytes[4];
          let counter = 0;

          // Editing fields of all ICONDIRECTORYs
          while (counter < images_present) {
            // horizontal coordinate of hotspot becomes color planes field
            new_file_bytes[10 + counter * 16] = 1;
            new_file_bytes[11 + counter * 16] = 0;
            // vertical coordinate of hotspot becomes bits per pixel field
            new_file_bytes[12 + counter * 16] = 0;
            new_file_bytes[13 + counter * 16] = 0;
            counter += 1;
          }
        } else {
          throw new TypeError(`Unsupported output format: ${outputFormat.internal}`);
        }
      } else if (inputFormat.internal === "ico") {
        if (outputFormat.internal === "ani") {
          throw new TypeError(
            "Refuse to convert from .ico directly to .ani; must use .cur as an intermediary.",
          );
        }
        // Convert a .cur into a .ico by ADDING hotspot and changing format header
        else if (outputFormat.internal === "cur") {
          // 1 for ICO, 2 for CUR
          new_file_bytes[2] = 2;

          const images_present = read_lendian(new_file_bytes[4], new_file_bytes[5]);
          let counter = 0;

          // Editing fields of all ICONDIRECTORYs
          while (counter < images_present) {
            // color planes field becomes horizontal coordinate of hotspot
            new_file_bytes[10 + counter * 16] = 0;
            new_file_bytes[11 + counter * 16] = 0;
            // bits per pixel field becomes vertical coordinate of hotspot
            new_file_bytes[12 + counter * 16] = 0;
            new_file_bytes[13 + counter * 16] = 0;
            counter += 1;
          }
        } else {
          throw new TypeError(`Unsupported output format: ${outputFormat.internal}`);
        }
      } else if (inputFormat.internal === "apng" && outputFormat.internal === "ani") {
        // To be added!
        throw new TypeError(`Unsupported input format: ${inputFormat.internal}`);
      } else {
        throw new TypeError(`Unsupported input format: ${inputFormat.internal}`);
      }

      outputFiles.push({
        name: changeExt(file.name, outputFormat.extension),
        bytes: new_file_bytes,
      });
    }
    return outputFiles;
  }
}

export default curaniHandler;
