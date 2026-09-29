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
      lossless: true
    }
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
    const is16 = _outputFormat.name.includes(16)
    for (const file of inputFiles) {
      if (file.bytes.byteLength > 0xffffff00) {
        ctx?.log("data too large. maximum size 4,294,967,040 bytes.", "error");
        continue;
      }
      if (file.bytes.byteLength > 0x7fffff00) {
        ctx?.log("data very large. successful conversion cannot be guaranteed.", "warn");
      }
      const sz = 2 * Math.ceil(file.bytes.byteLength / 2) // this actually can't change at all because of the whole umm.
      const head1 = new Uint8Array([82, 73, 70, 70, ...n32(sz + 36), 87, 65, 86, 69]);
      const head2 = new Uint8Array([102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0, ...(is16? [68, 172, 0, 0]: [228,87,0,0]), ...(is16? [136, 88, 1, 0]: [228,87,0,0]), (is16?2:1), 0, (is16?16:8), 0,]);
      const head3 = new Uint8Array([100, 97, 116, 97, ...n32(sz)]);
      const r = new Uint8Array(sz + 44);
      r.set(head1, 0);
      r.set(head2, 12);
      r.set(head3, 36);
      r.set(file.bytes, 44);
      sz-file.bytes.byteLength && (r[r.length-1] = 0)
      outputFiles.push({ name: file.name.split(".").slice(0, -1).join(".") + ".wav", bytes: r });
    }
    return outputFiles;
  }
}

export default wavebreakHandler;
