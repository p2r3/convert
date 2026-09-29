import type { ConvertContext } from "src/ui/ProgressStore.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";

class wavebreakHandler implements FormatHandler {
  public name: string = "wavebreak";
  public supportedFormats: FileFormat[] = [
    CommonFormats.WAV.builder("wav").allowTo().markLossless(),
    {
      name: "PCM signed 16-bit little-endian", // from ffmpeg
      format: "s16le",
      extension: "s16le",
      mime: "audio/s16le", // interpreted as 44.1 kHz mono
      from: true,
      to: false,
      internal: "s16le",
      category: Category.AUDIO,
      lossless: true,
    },
    {
      name: "PCM unsigned 8-bit",
      format: "u8",
      extension: "u8",
      mime: "audio/u8", // once again interpreted as std. mono
      from: true,
      to: false,
      internal: "u8",
      category: Category.AUDIO,
      lossless: true,
    },
    {
      name: "PCM signed 24-bit little-endian",
      format: "s24le",
      extension: "s24le",
      mime: "audio/s24le",
      from: true,
      to: false,
      internal: "s24le",
      category: Category.AUDIO,
      lossless: true,
    },
    {
      name: "PCM signed 32-bit little-endian",
      format: "s32le",
      extension: "s32le",
      mime: "audio/s32le",
      from: true,
      to: false,
      internal: "s32le",
      category: Category.AUDIO,
      lossless: true,
    },
    {
      name: "PCM 32-bit floating-point little-endian",
      format: "f32le",
      extension: "f32le",
      mime: "audio/f32le",
      from: true,
      to: false,
      internal: "f32le",
      category: Category.AUDIO,
      lossless: true,
    },
    {
      name: "PCM 64-bit floating-point little-endian",
      format: "f64le",
      extension: "f64le",
      mime: "audio/f64le",
      from: true,
      to: false,
      internal: "f32le",
      category: Category.AUDIO,
      lossless: true,
    },
  ];
  public ready: boolean = false;
  public offload: boolean = true;

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
    const n32 = (t: number) => new Uint8Array(new Uint32Array([t]).buffer);
    const me = _outputFormat.mime;
    let is8, bd, fn;
    [is8, bd, fn] = [me.length < 9, is8 ? 8 : +me.slice(7, 9), +(me[6] == "f")];
    for (const file of inputFiles) {
      if (file.bytes.byteLength > 0xffffff00) {
        ctx?.log("data too large. maximum size 4,294,967,040 bytes.", "error");
        continue;
      }
      if (file.bytes.byteLength > 0x7fffff00) {
        ctx?.log("data very large. successful conversion cannot be guaranteed.", "warn");
      }
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      let g = ((a, b = a) => (!a[1] ? (b[0] * b[1]) / a[0] : g([a[1], a[0] % a[1]], b))); g=g([2,bd/8])
      const sz = g * Math.ceil(file.bytes.byteLength / g); // this actually can't change at all because of the whole umm.
      const head1 = new Uint8Array([82, 73, 70, 70, ...n32(sz + 36), 87, 65, 86, 69]);
      // oxfmt-ignore
      const head2 = new Uint8Array([102, 109, 116, 32, 16, 0, 0, 0, (1+2*fn), 0, 1, 0, ...n32(is8?22500:44100), ...n32(is8?22500:44100*bd/8), bd/8, 0, bd, 0]);
      const head3 = new Uint8Array([100, 97, 116, 97, ...n32(sz)]);
      const r = new Uint8Array(sz + 44);
      r.set(head1, 0);
      r.set(head2, 12);
      r.set(head3, 36);
      r.set(file.bytes, 44);
      // eslint-disable-next-line no-unused-expressions
      sz - file.bytes.byteLength && (r[r.length - 1] = 0);
      outputFiles.push({ name: file.name.split(".").slice(0, -1).join(".") + ".wav", bytes: r });
    }
    return outputFiles;
  }
}

export default wavebreakHandler;
