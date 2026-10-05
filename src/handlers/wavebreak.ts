import type { ConvertContext } from "src/ui/ProgressStore.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { changeExt } from "src/common/index.ts";

class wavebreakHandler implements FormatHandler {
  public readonly name = "wavebreak";
  public supportedFormats = [
    // output format
    Formats.WAV.builder("wav").lossless().to(),
    // reccommended input formats
    Formats.S16LE.builder("s16le").lossless().from(), // interpreted as 44.1 kHz mono
    Formats.U8.builder("u8").lossless().from(), // once again interpreted as std. mono
    Formats.S24LE.builder("s24le").lossless().from(),
    Formats.S32LE.builder("s32le").lossless().from(),
    Formats.F32LE.builder("f32le").lossless().from(),
    Formats.F64LE.builder("f64le").lossless().from(),
    // "technically supported" input formats (sign doesn't matter much so their fruits hang low)
    Formats.S8.builder("s8").from(),
    Formats.U16LE.builder("u16le").from(),
    Formats.U24LE.builder("u24le").from(),
    Formats.U32LE.builder("u32le").from(),
    // other-end input formats (oh boy)
    Formats.S16BE.builder("s16be").lossless().from(),
    Formats.S24BE.builder("s24be").lossless().from(),
    Formats.S32BE.builder("s32be").lossless().from(),
    Formats.F32BE.builder("f32be").lossless().from(),
    Formats.F64BE.builder("f64be").lossless().from(),
    // last group will not be implemented until be starts to be.
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
    const is8 = me.length < 9;
    const [bd, fn, oe] = [is8 ? 8 : +me.slice(7, 9), +(me[6] == "f"), is8 ? null : (me[9] == "b")];
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
      const g = g0([2, bd/8]);
      const sz = g * Math.ceil(file.bytes.byteLength / g); // this actually can't change at all because of the whole umm.
      const head1 = new Uint8Array([82, 73, 70, 70, ...n32(sz + 36), 87, 65, 86, 69]);
      // oxfmt-ignore
      const head2 = new Uint8Array([102, 109, 116, 32, 16, 0, 0, 0, (1+2*fn), 0, 1, 0, ...n32(is8?22500:44100), ...n32(is8?22500:44100*bd/8), bd/8, 0, bd, 0]);
      const head3 = new Uint8Array([100, 97, 116, 97, ...n32(sz)]);
      const r = new Uint8Array(sz + 44).fill(0); // explicitly filling with 0
      r.set(head1, 0);
      r.set(head2, 12);
      r.set(head3, 36);
      let ps = new Array();
      if (oe) {
        for (let b = 0; b < sz; b += bd/8) {
          ps.push(file.bytes.slice(b,b+bd/8));
        }
        ps = ps.map(x => x.toReversed()); // i don't need reverse because i'm using map
        ps = new Uint8Array(ps.flat());
      }
      else {
        ps = file.bytes;
      }
      r.set(ps, 44);
      outputFiles.push({ name: changeExt(file.name, "wav"), bytes: r });
    }
    return outputFiles;
  }
}

export default wavebreakHandler;
