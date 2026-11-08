import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats, { SpecialFormats } from "src/Formats.ts";
import { BadMagicError } from "src/errors.ts";
import { changeExt, decode, encode, stripExt } from "src/common/index.ts";
import { extractedParent } from "src/common/path.ts";

interface WadLump {
  name: string;
  data: Uint8Array;
}

interface ParsedWAD {
  type: string;
  lumps: WadLump[];
}

class wadHandler implements FormatHandler {
  public readonly name = "wad";
  public supportedFormats = [
    Formats.WAD.builder("wad").lossless().fromTo(),
    SpecialFormats.ANY.builder("ANY").lossless().fromTo(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  private parseWAD(bytes: Uint8Array): ParsedWAD {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== "IWAD" && magic !== "PWAD") {
      throw new BadMagicError(
        `Not a valid WAD file (missing IWAD/PWAD header). The following magic was found instead: ${magic}`,
      );
    }
    const numLumps = view.getInt32(4, true);
    const dirOffset = view.getInt32(8, true);
    const lumps: WadLump[] = [];
    for (let i = 0; i < numLumps; i++) {
      const entryOffset = dirOffset + i * 16;
      const lumpOffset = view.getInt32(entryOffset, true);
      const lumpSize = view.getInt32(entryOffset + 4, true);
      // Lump name: 8 bytes, null-padded
      let lumpName = "";
      for (let j = 0; j < 8; j++) {
        const c = bytes[entryOffset + 8 + j];
        if (c === 0) break;
        lumpName += String.fromCharCode(c);
      }
      const data =
        lumpSize > 0
          ? new Uint8Array(bytes.buffer, bytes.byteOffset + lumpOffset, lumpSize)
          : new Uint8Array(0);
      // Clone to avoid mutating the source buffer
      lumps.push({ name: lumpName, data: new Uint8Array(data) });
    }
    return { type: magic, lumps };
  }

  private buildWAD(lumps: WadLump[], wadType: string = "PWAD"): Uint8Array {
    const headerSize = 12;
    let dataSize = 0;
    for (const lump of lumps) dataSize += lump.data.length;
    const dirSize = lumps.length * 16;
    const total = headerSize + dataSize + dirSize;

    const buffer = new Uint8Array(total);
    const view = new DataView(buffer.buffer);

    // Write WAD type magic (IWAD or PWAD)
    const magic = wadType === "IWAD" ? "IWAD" : "PWAD";
    buffer[0] = magic.charCodeAt(0);
    buffer[1] = magic.charCodeAt(1);
    buffer[2] = magic.charCodeAt(2);
    buffer[3] = magic.charCodeAt(3);
    view.setInt32(4, lumps.length, true);
    view.setInt32(8, headerSize + dataSize, true); // directory offset

    // Write lump data and collect offsets
    const lumpOffsets: number[] = [];
    let offset = headerSize;
    for (const lump of lumps) {
      lumpOffsets.push(offset);
      buffer.set(lump.data, offset);
      offset += lump.data.length;
    }

    // Write directory
    let dirPos = headerSize + dataSize;
    for (let i = 0; i < lumps.length; i++) {
      view.setInt32(dirPos, lumpOffsets[i], true);
      view.setInt32(dirPos + 4, lumps[i].data.length, true);
      // Lump name: 8 bytes, null-padded (preserve original casing)
      const nameBytes = encode(lumps[i].name.substring(0, 8));
      buffer.set(nameBytes, dirPos + 8);
      dirPos += 16;
    }

    return buffer;
  }

  /** Names lumps `NAME.index`, matching .wadmeta.json, so they stay unique. */
  private lumpFileName(name: string, index: number): string {
    return `${name || "UNNAMED"}.${index}`;
  }

  private wadMetadata(type: string, lumps: WadLump[]) {
    return {
      wadType: type,
      lumps: lumps.map((l, i) => ({ index: i, name: l.name })),
    };
  }

  /** Rebuilds lumps from extracted files, losslessly if .wadmeta.json is among them. */
  private lumpsFromFiles(files: FileData[]): {
    type: string;
    lumps: WadLump[];
  } {
    const byName = new Map(files.map((f) => [f.name, f.bytes]));
    const metaBytes = byName.get(".wadmeta.json");
    if (metaBytes) {
      try {
        const metadata: ReturnType<wadHandler["wadMetadata"]> = JSON.parse(decode(metaBytes));
        const lumps = metadata.lumps.map(({ index, name }) => ({
          name,
          // Empty lumps (markers) have no file
          data: byName.get(this.lumpFileName(name, index)) ?? new Uint8Array(0),
        }));
        return { type: metadata.wadType, lumps };
      } catch {
        // Invalid metadata, proceed without it
      }
    }
    // Lossy mode: use file names without extension as lump names (max 8 chars)
    const lumps = files
      .filter((f) => f.name !== ".wadmeta.json")
      .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((f) => ({
        name: stripExt(f.name.split("/").pop()!).substring(0, 8),
        data: f.bytes,
      }));
    return { type: "PWAD", lumps };
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    if (inputFormat.internal === "wad") {
      for (const file of inputFiles) {
        const { type, lumps } = this.parseWAD(file.bytes);

        if (outputFormat.mime === SpecialFormats.ANY.mime) {
          // WAD → files: each non-empty lump becomes a file, empty ones live on in the metadata
          const path = extractedParent(file, inputFiles.length > 1);
          outputFiles.push({
            name: ".wadmeta.json",
            path,
            bytes: encode(JSON.stringify(this.wadMetadata(type, lumps), null, 2)),
          });
          lumps.forEach((lump, i) => {
            if (lump.data.length)
              outputFiles.push({
                name: this.lumpFileName(lump.name, i),
                path,
                bytes: lump.data,
              });
          });
        } else if (outputFormat.internal === "wad") {
          // WAD → WAD (passthrough / preserve type)
          const rebuilt = this.buildWAD(lumps, type);
          outputFiles.push({
            bytes: rebuilt,
            name: changeExt(file.name, "wad"),
          });
        }
      }
    } else if (outputFormat.internal === "wad") {
      // Any files → WAD: all inputs become lumps of one WAD
      const { type, lumps } = this.lumpsFromFiles(inputFiles);
      outputFiles.push({
        bytes: this.buildWAD(lumps, type),
        name: "archive.wad",
      });
    } else {
      throw new Error("Invalid input-output.");
    }

    return outputFiles;
  }
}

export default wadHandler;
