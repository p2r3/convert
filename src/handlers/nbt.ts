import type { FileData, FileFormat, FormatHandler } from "src/FormatHandler.ts";
import * as NBT from "nbtify";
import Formats from "src/Formats.ts";
import { changeExt, decode, encode } from "src/common/index.ts";
import { compressGzip } from "src/common/gzip.ts";

class nbtHandler implements FormatHandler {
  public readonly name = "nbt";
  public supportedFormats = [
    Formats.NBT.builder("nbt").lossless().fromTo(),
    Formats.JSON.builder("json").lossless().fromTo(),
    Formats.SNBT.builder("snbt").lossless().fromTo(), // only compression data is lost
  ];
  public ready = false;

  public indent: number = 2;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    // nbt -> json
    if (inputFormat.internal === "nbt" && outputFormat.internal === "json") {
      for (const file of inputFiles) {
        const nbt = await NBT.read(file.bytes);
        const j = JSON.stringify(
          nbt.data,
          (key, value) => (typeof value === "bigint" ? value.toString() : value),
          this.indent,
        );
        outputFiles.push({
          name: changeExt(file.name, "json"),
          bytes: encode(j),
        });
      }
    }

    // json -> nbt
    if (inputFormat.internal === "json" && outputFormat.internal === "nbt") {
      for (const file of inputFiles) {
        const text = decode(file.bytes);
        const obj = JSON.parse(text);
        const bd = await NBT.write(obj);
        outputFiles.push({
          name: changeExt(file.name, outputFormat.extension),
          bytes: bd,
        });
      }
    }

    // snbt -> nbt
    if (inputFormat.internal === "snbt" && outputFormat.internal === "nbt") {
      for (const file of inputFiles) {
        const text = decode(file.bytes);
        const nbt = NBT.parse(text);
        const bd = await NBT.write(nbt);
        outputFiles.push({
          name: changeExt(file.name, outputFormat.extension),
          bytes: bd,
        });
      }
    }
    // nbt -> snbt
    if (inputFormat.internal === "nbt" && outputFormat.internal === "snbt") {
      for (const file of inputFiles) {
        const nbt = await NBT.read(file.bytes);
        const text = NBT.stringify(nbt, {
          space: this.indent,
        });
        outputFiles.push({
          name: changeExt(file.name, "snbt"),
          bytes: encode(text),
        });
      }
    }

    // nbt -> schem / schematic
    if (
      inputFormat.internal === "nbt" &&
      (outputFormat.internal === "schem" || outputFormat.internal === "schematic")
    ) {
      for (const file of inputFiles) {
        outputFiles.push({
          name: changeExt(file.name, outputFormat.extension),
          bytes: await compressGzip(file.bytes),
        });
      }
    }

    if (outputFiles.length === 0) {
      throw new TypeError(
        `nbtHandler does not support route: ${inputFormat.internal} -> ${outputFormat.internal}`,
      );
    }

    return outputFiles;
  }
}

export default nbtHandler;
