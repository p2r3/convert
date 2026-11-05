import {
  sameFormat,
  type FileData,
  type FileFormat,
  type FormatHandler,
  type IFormatDefinition,
} from "../FormatHandler.ts";
import Formats from "src/Formats.ts";

import { changeExt, stripExt } from "src/common/index.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import { InitializationError } from "src/errors.ts";

function padNumberString(num: number, digits: number): string {
  let str = String(num);

  while (str.length < digits) {
    str = "0" + str;
  }

  return str;
}

const COMIC_FORMATS = {
  cbz: [Formats.CBZ, Formats.ZIP],
  cbt: [Formats.CBT, Formats.TAR],
  cbr: [Formats.CBR, Formats.RAR],
  cb7: [Formats.CB7, Formats.SZ],
} as const;

export class comicsPackerHandler implements FormatHandler {
  public readonly name = "comicsPacker";
  public supportedFormats?: FileFormat[];
  public ready = false;

  #sevenzip?: FormatHandler;

  async init() {
    this.#sevenzip = new (await import("./sevenZip.ts")).default();
    await this.#sevenzip.init();
    const contains = (format: IFormatDefinition) =>
      this.#sevenzip?.supportedFormats?.some((f) => sameFormat(f, format) && f.to);
    this.supportedFormats = [
      Formats.PNG.builder("png").from(),
      Formats.JPEG.builder("jpg").from(),
      Formats.WEBP.builder("webp").from(),
      Formats.BMP.builder("bmp").from(),
      Formats.TIFF.builder("tiff").from(),
      Formats.GIF.builder("gif").from(),
    ];
    for (const [comic, archive] of Object.values(COMIC_FORMATS)) {
      if (contains(archive)) this.supportedFormats.push(comic.builder(comic.extension).to());
    }
    this.ready = this.#sevenzip.ready;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    if (!this.#sevenzip) throw new InitializationError();

    if (inputFormat.internal === "gif" && inputFiles.length === 1)
      throw new Error("Probably wanted to make an archive of frames, abort");

    const baseName = stripExt(
      inputFiles[0].name.replace("_0." + inputFormat.extension, "." + inputFormat.extension),
    );

    const comicFiles: FileData[] = [];

    const digits = String(inputFiles.length - 1).length;
    for (const [i, file] of inputFiles.entries()) {
      comicFiles.push({
        name: padNumberString(i, digits) + "." + inputFormat.extension,
        bytes: file.bytes,
      });
    }

    const comicEntry = Object.values(COMIC_FORMATS).find(([comic]) =>
      sameFormat(outputFormat, comic),
    );
    if (!comicEntry) throw new Error(`Cannot convert to ${outputFormat.format}`);

    const archiveFormat = this.#sevenzip.supportedFormats?.find((f) =>
      sameFormat(f, comicEntry[1]),
    );
    if (!archiveFormat)
      throw new Error(`Sevenzip did not have a format for ${outputFormat.extension}`);

    const outputFiles = await this.#sevenzip.doConvert(comicFiles, inputFormat, archiveFormat, ctx);

    return outputFiles.map((f) => ({
      name: changeExt(baseName, outputFormat.extension),
      bytes: f.bytes,
    }));
  }
}

function createRenameHandler<K extends keyof typeof COMIC_FORMATS>(format: K) {
  const [comic, archive] = COMIC_FORMATS[format];
  return class implements FormatHandler {
    public readonly name = `${format}Rename` as const;
    public supportedFormats = [
      comic.builder(comic.extension).from(),
      archive.builder(archive.extension).lossless().to(),
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
      return inputFiles.map((file) => ({
        ...file,
        name: changeExt(file.name, outputFormat.extension),
      }));
    }
  };
}

export const cbzRenameHandler = createRenameHandler("cbz");
export const cbtRenameHandler = createRenameHandler("cbt");
export const cbrRenameHandler = createRenameHandler("cbr");
export const cb7RenameHandler = createRenameHandler("cb7");
