import type { ConvertContext } from "src/ui/ProgressStore.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt } from "src/common/index.ts";

class wavebreakHandler implements FormatHandler {
  public readonly name = "wavebreak";
  public supportedFormats = [
    Formats.WAV.builder("wav").lossless().to(),
    Formats.S16LE.builder("s16le").lossless().from(), // interpreted as 44.1 kHz mono
    Formats.U8.builder("u8").lossless().from(), // once again interpreted as std. mono
    Formats.S24LE.builder("s24le").lossless().from(),
    Formats.S32LE.builder("s32le").lossless().from(),
    Formats.F32LE.builder("f32le").lossless().from(),
    Formats.F64LE.builder("f64le").lossless().from(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    _outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const n32 = (t: number): Uint8Array => new Uint8Array(new Uint32Array([t]).buffer);
    const me = _inputFormat.mime;
    let [is8, bd, fn] = [me.length < 9, is8 ? 8 : +me.slice(7, 9), +(me[6] == "f")];
    for (const file of inputFiles) {
      if (file.bytes.byteLength > 0xffffff00) {
        ctx?.log("data too large. maximum size 4,294,967,040 bytes.", "error");
        continue;
      }
      if (file.bytes.byteLength > 0x7fffff00) {
        ctx?.log("data very large. successful conversion cannot be guaranteed.", "warn");
      }
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      const g0 = (a : number[], b : number[] = a) : number => (!a[1] ? (b[0] * b[1]) / a[0] : g0([a[1], a[0] % a[1]], b)); // oxfmt-ignore
      const g = g0([2, bd / 8]);
      const sz = g * Math.ceil(file.bytes.byteLength / g); // this actually can't change at all because of the whole umm.
      const head1 = new Uint8Array([82, 73, 70, 70, ...n32(sz + 36), 87, 65, 86, 69]);
      // oxfmt-ignore
      const head2 = new Uint8Array([102, 109, 116, 32, 16, 0, 0, 0, (1+2*fn), 0, 1, 0, ...n32(is8?22500:44100), ...n32(is8?22500:44100*bd/8), bd/8, 0, bd, 0]);
      const head3 = new Uint8Array([100, 97, 116, 97, ...n32(sz)]);
      const r = new Uint8Array(sz + 44).fill(0); // explicitly filling with 0
      r.set(head1, 0);
      r.set(head2, 12);
      r.set(head3, 36);
      r.set(file.bytes, 44);
      outputFiles.push({ name: changeExt(file.name, "wav"), bytes: r });
    }
    return outputFiles;
  }
}

export default wavebreakHandler;
