import { changeExt, decode, encode } from "src/common/index.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { gunzipSync, gzipSync } from "fflate";
import JSZip from "jszip";

class gdlvlHandler implements FormatHandler {
  public readonly name = "gdlvl";
  public supportedFormats = [
    Formats.GMD.builder("gmd").fromTo(),
    Formats.GMD2.builder("gmd2").lossless().fromTo(),
    Formats.GDLVL.builder("gdlvl").fromTo(),
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
      let data: string | null = null;

      if (inputFormat.internal === "gmd") {
        data = decode(inputFile.bytes);
      } else if (inputFormat.internal === "gmd2") {
        const zip = new JSZip();
        await zip.loadAsync(inputFile.bytes);
        const file = await zip.file("level.data")?.async("string");
        if (!file) throw new Error("The gmd2 file did not have level.data");
        data = file;
      } else if (inputFormat.internal === "gdlvl") {
        const compressed = Uint8Array.fromBase64(decode(inputFile.bytes), {
          alphabet: "base64url",
        });
        data = decode(gunzipSync(compressed));
      } else {
        throw new Error(`Cannot convert from ${inputFormat.extension}`);
      }

      let bytes: Uint8Array | null = null;

      if (outputFormat.internal === "gmd") {
        bytes = encode(data);
      } else if (outputFormat.internal === "gmd2") {
        const zip = new JSZip();
        zip.file("level.meta", "{}");
        zip.file("level.data", data);
        bytes = await zip.generateAsync({ type: "uint8array" });
      } else if (outputFormat.internal === "gdlvl") {
        const compressed = gzipSync(encode(data));
        bytes = encode(compressed.toBase64({ alphabet: "base64url" }));
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

export default gdlvlHandler;
