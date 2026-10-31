import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { PbfReader, PbfWriter } from "pbf";
import { changeExt, decode, encode } from "src/common/index.ts";

function readBigVarint(pbf: PbfReader) {
  let result = 0n,
    shift = 0n,
    b;
  do {
    b = pbf.buf[pbf.pos++];
    result |= BigInt(b & 0x7f) << shift;
    shift += 7n;
  } while (b >= 0x80);
  return result;
}

function writeBigVarintField(pbf: PbfWriter, tag: number, v: bigint) {
  v = BigInt.asUintN(64, BigInt(v));
  pbf.writeTag(tag, 0);
  pbf.realloc(10);
  while (v >= 0x80n) {
    pbf.buf[pbf.pos++] = Number(v & 0x7fn) | 0x80;
    v >>= 7n;
  }
  pbf.buf[pbf.pos++] = Number(v);
}

function writeValue(key: number, value: any, pbf: PbfWriter) {
  if (value === null) {
    pbf.writeVarintField(key, 0);
  } else if (Array.isArray(value)) {
    for (const x of value) {
      writeValue(key, x, pbf);
    }
  } else if (typeof value === "object") {
    pbf.writeMessage(key, writeObject, value);
  } else if (typeof value === "string") {
    if (value.length === 0) {
      pbf.writeStringField(key, "");
      return;
    }
    try {
      const bigint = BigInt(value);
      writeBigVarintField(pbf, key, bigint);
      return;
    } catch {}
    try {
      const bytes = Uint8Array.fromBase64(value, { lastChunkHandling: "strict" });
      pbf.writeBytesField(key, bytes);
      return;
    } catch {}
    pbf.writeStringField(key, value);
  } else if (typeof value === "number") {
    pbf.writeDoubleField(key, value);
  } else if (typeof value === "boolean") {
    pbf.writeBooleanField(key, value);
  }
}

function writeObject(object: Record<string, any>, pbf: PbfWriter) {
  const usedFields = new Set();
  const deferred: Record<string, any> = {};
  const normalized: Map<number, any> = new Map();
  for (const [key, value] of Object.entries(object)) {
    const field = parseInt(key);
    if (Number.isNaN(field) || field <= 0 || usedFields.has(field)) {
      deferred[key] = value;
      continue;
    }
    usedFields.add(field);

    normalized.set(field, value);
  }
  let nextField = 1;
  for (const value of Object.values(deferred)) {
    while (usedFields.has(nextField)) nextField++;
    usedFields.add(nextField);

    normalized.set(nextField, value);
  }

  for (const [key, value] of normalized.entries()) {
    writeValue(key, value, pbf);
  }
}

class pbfHandler implements FormatHandler {
  public readonly name = "pbf";
  public supportedFormats = [
    Formats.PBF.builder("pbf").fromTo(),
    Formats.JSON.builder("json").lossless().fromTo(),
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

    for (const inputFile of inputFiles) {
      let data: Record<string, any> = {};

      if (inputFormat.internal === "pbf") {
        const pbf = new PbfReader(inputFile.bytes);

        function addOrArray(n: number, value: any) {
          const field = String(n);
          if (field in data) {
            if (!Array.isArray(data[field])) data[field] = [data[field]];

            data[field].push(value);
          } else {
            data[field] = value;
          }
        }

        let field;
        while ((field = pbf.nextField())) {
          if (pbf.type === 0) {
            // varint
            addOrArray(field, String(readBigVarint(pbf)));
          } else if (pbf.type === 1) {
            // 64 bits
            addOrArray(field, pbf.readDouble());
          } else if (pbf.type === 2) {
            // data
            addOrArray(field, pbf.readBytes().toBase64());
          } else if (pbf.type === 5) {
            // 32 bits
            addOrArray(field, pbf.readFloat());
          } else {
            throw new Error(`Unsupported type ${pbf.type} on field ${field}`);
          }
        }

        if (pbf.pos < pbf.length) throw new Error("Failed to read protobuf file");
      } else if (inputFormat.internal === "json") {
        data = JSON.parse(decode(inputFile.bytes));
      } else {
        throw new Error(`Cannot convert from ${inputFormat.extension}`);
      }

      let bytes: Uint8Array;

      if (outputFormat.internal === "pbf") {
        const pbf = new PbfWriter();

        writeObject(data, pbf);

        bytes = pbf.finish();
      } else if (outputFormat.internal === "json") {
        bytes = encode(JSON.stringify(data));
      } else {
        throw new Error(`Cannot convert to ${outputFormat.extension}`);
      }

      outputFiles.push({
        name: changeExt(inputFile.name, outputFormat.extension),
        bytes,
      });
    }

    return outputFiles;
  }
}

export default pbfHandler;
