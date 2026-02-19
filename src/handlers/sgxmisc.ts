import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import { FormatDefinition } from "../FormatHandler.ts";

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

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(0, i) : name;
}

class sgxmiscHandler implements FormatHandler {
  public name = "sgxmiscHandler";
  public supportedFormats?: FileFormat[];
  public ready = false;

  async init() {
    this.supportedFormats = [
      SGX.builder("sgx").allowFrom().allowTo().markLossless(),
      CommonFormats.TEXT.builder("text").allowFrom().allowTo(),
      CommonFormats.JSON.builder("json").allowFrom().allowTo(),
    ];
    this.ready = true;
  }

  async doConvert(inputFiles: FileData[], inputFormat: FileFormat, outputFormat: FileFormat) {
    const out: FileData[] = [];

    for (const f of inputFiles) {
      const base = stripExt(f.name);

      // SGX <-> TEXT passthrough
      if (inputFormat.format === "sgx" && outputFormat.format === "text") {
        out.push({ name: `${base}.txt`, bytes: new Uint8Array(f.bytes) });
      }

      if (inputFormat.format === "text" && outputFormat.format === "sgx") {
        const txt = textDecode(new Uint8Array(f.bytes));
        out.push({ name: `${base}.sgx`, bytes: textEncode(txt) });
      }

      // SGX <-> JSON container
      if (inputFormat.format === "sgx" && outputFormat.format === "json") {
        const txt = textDecode(new Uint8Array(f.bytes));
        const json = JSON.stringify({ type: "SGX", content: txt }, null, 2);
        out.push({ name: `${base}.json`, bytes: textEncode(json) });
      }

      if (inputFormat.format === "json" && outputFormat.format === "sgx") {
        const obj = JSON.parse(textDecode(new Uint8Array(f.bytes)));
        if (obj?.type === "SGX") {
          out.push({ name: `${base}.sgx`, bytes: textEncode(obj.content) });
        }
      }
    }

    return out;
  }
}

export default sgxmiscHandler;
