import {
  CompositeOperator,
  initializeImageMagick,
  Magick,
  MagickImage,
  MagickFormat,
  MagickImageCollection,
  MagickReadSettings,
  MagickGeometry,
  QuantizeSettings,
  DitherMethod,
} from "@imagemagick/magick-wasm";
import { optimise } from "@jsquash/oxipng";

import mime from "mime";
import magickWasmUrl from "@imagemagick/magick-wasm/magick.wasm?url";
import normalizeMimeType from "../normalizeMimeType.ts";
import Formats, { Category, isCategory } from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { ConvertContext } from "../ui/ProgressStore.js";
import { changeExt } from "src/common/index.ts";
import { createCanvas, drawWatermark } from "src/common/canvas.ts";

/** Output types that hold one picture, so that several inputs give several files. */
const SINGLE_PICTURE_TYPES = new Set(["image/png", "image/jpeg", "image/bmp"]);

/**
 * File formats ImageMagick handles that have no registered MIME type, and that `init` would
 * otherwise skip for that reason. An explicit list, because most of what ImageMagick calls a
 * format without a MIME type is not a file at all: generators ("gradient", "plasma"), dumps
 * of raw samples ("rgb", "gray") and protocols ("http").
 */
const UNREGISTERED_FORMATS = new Set(
  [
    // camera raw, developed by the LibRaw that is part of ImageMagick
    "3fr arw cr2 cr3 crw erf fff iiq k25 kdc mdc mef mos mrw nef nrw orf pef raf rw2 rwl sr2 srf",
    "srw x3f",
    // everything else
    "aai art avs cals cin cut dcx farbfeld fax fl32 fts g4 hdr hrz jnx mac mat miff mtv otb palm",
    "pcd pes pgx phm picon pict pix pwp rla rle scr sct sfw sixel sun tim tm2 vicar viff vips wpg",
  ].flatMap((names) => names.split(" ")),
);

class ImageMagickHandler implements FormatHandler {
  public readonly name = "ImageMagick";
  public supportedFormats: FileFormat[] = [];
  public ready = false;

  async init() {
    const wasmBuffer = await fetch(magickWasmUrl).then((r) => r.arrayBuffer());
    const wasmBytes = new Uint8Array(wasmBuffer);

    await initializeImageMagick(wasmBytes);

    this.supportedFormats = [];
    Magick.supportedFormats.forEach((format) => {
      const formatName = format.format.toLowerCase();
      if (formatName === "apng") return;
      if (formatName === "svg") return;
      if (formatName === "ttf") return;
      if (formatName === "otf") return;
      let mimeType = format.mimeType || mime.getType(formatName);
      if (!mimeType && UNREGISTERED_FORMATS.has(formatName)) mimeType = `image/x-${formatName}`;
      if (
        !mimeType ||
        mimeType.startsWith("text/") ||
        mimeType.startsWith("video/") ||
        mimeType === "application/json"
      )
        return;

      mimeType = normalizeMimeType(mimeType);

      // ImageMagick _really_ likes mislabeling formats
      let description = format.description;
      if (mimeType === "image/jpeg") description = Formats.JPEG.name;
      if (mimeType === "image/gif") description = Formats.GIF.name;
      if (mimeType === "image/webp") description = Formats.WEBP.name;
      if (formatName === "ico") description = "Microsoft Windows ICO";
      if (formatName === "mpo") description = "Multi-Picture Object";
      if (formatName === "vst") description = "Microsoft Visio Template";

      const mimeCategory = mimeType.split("/")[0];
      let category;
      if (isCategory(mimeCategory)) category = mimeCategory;
      else if (mimeType === "application/pdf") category = Category.DOCUMENT;
      else category = Category.IMAGE;
      this.supportedFormats.push({
        name: description,
        format: formatName === "jpg" ? "jpeg" : formatName,
        extension: formatName,
        mime: mimeType,
        from: mimeType === "application/pdf" ? false : format.supportsReading,
        to: format.supportsWriting,
        internal: format.format,
        category,
        lossless: ["png", "bmp", "tiff"].includes(formatName),
      });
    });

    // ====== Manual fine-tuning ======

    const prioritize = ["png", "jpeg", "gif", "pdf"];
    prioritize.reverse();

    this.supportedFormats.sort((a, b) => {
      const priorityIndexA = prioritize.indexOf(a.format);
      const priorityIndexB = prioritize.indexOf(b.format);
      return priorityIndexB - priorityIndexA;
    });

    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    // all inputs go into one image collection and one output, which a palette doesn't ask for,
    // and which a format of one picture can't hold: several photos to PNG are several PNGs
    const singlePicture = SINGLE_PICTURE_TYPES.has(outputFormat.mime);
    if ((ctx?.settings.colors || singlePicture) && inputFiles.length > 1) {
      const outputs: FileData[] = [];
      for (const file of inputFiles) {
        outputs.push(...(await this.doConvert([file], inputFormat, outputFormat, args, ctx)));
      }
      return outputs;
    }
    const inputMagickFormat = inputFormat.internal as MagickFormat;
    const outputMagickFormat = outputFormat.internal as MagickFormat;

    const inputSettings = new MagickReadSettings();
    inputSettings.format = inputMagickFormat;

    ctx?.log(`Initialising ImageMagick for ${inputFiles.length} files...`);

    let bytes: Uint8Array = await new Promise((resolve) => {
      MagickImageCollection.use((outputCollection) => {
        let processedCount = 0;
        for (const inputFile of inputFiles) {
          ctx?.throwIfAborted();
          const progressMsg = `Reading ${inputFile.name}...`;
          ctx?.progress(progressMsg, processedCount / inputFiles.length);
          ctx?.log(progressMsg);

          if (inputFormat.format === "rgb") {
            // Guess how big the Image should be
            inputSettings.width = Math.sqrt(inputFile.bytes.length / 3);
            inputSettings.height = inputSettings.width;
            ctx?.log(
              `Detected RAW RGB format. Guessed dimensions: ${inputSettings.width}x${inputSettings.height}`,
              "debug",
            );
          }
          MagickImageCollection.use((fileCollection) => {
            fileCollection.read(inputFile.bytes, inputSettings);
            ctx?.log(
              `Successfully read ${inputFile.name}. Found ${fileCollection.length} sub-images/frames.`,
              "debug",
            );

            let frameIndex = 0;
            while (fileCollection.length > 0) {
              const image = fileCollection.shift();
              if (!image) break;

              if (outputFormat.format === "ico" && (image.width > 256 || image.height > 256)) {
                ctx?.log(
                  `Image ${inputFile.name} frame ${frameIndex} too large for ICO (${image.width}x${image.height}). Resizing to 256x256...`,
                  "warn",
                );
                const geometry = new MagickGeometry(256, 256);
                image.resize(geometry);
              }

              const { quality, maxSize, stripMetadata, colors } = ctx?.settings ?? {};
              if (quality) image.quality = quality;
              // a geometry without flags fits inside the box and keeps the aspect ratio
              if (maxSize && Math.max(image.width, image.height) > maxSize) {
                image.resize(new MagickGeometry(maxSize, maxSize));
              }
              if (stripMetadata) image.strip();
              const watermark = ctx?.settings.watermark;
              if (watermark) {
                // drawn by the browser and laid over the frame, because this build has no fonts
                const overlay = createCanvas(image.width, image.height);
                drawWatermark(overlay.ctx, image.width, image.height, watermark);
                const stamp = MagickImage.create();
                stamp.readFromCanvas(overlay.canvas as unknown as HTMLCanvasElement);
                image.composite(stamp, CompositeOperator.Over);
                stamp.dispose();
              }
              if (colors) {
                // after resizing, which would blend new colours back in
                const palette = new QuantizeSettings();
                palette.colors = colors;
                palette.ditherMethod = DitherMethod.FloydSteinberg;
                image.quantize(palette);
              }

              outputCollection.push(image);
              frameIndex++;
            }
          });
          processedCount++;
        }

        const writingMsg = `Encoding output as ${outputFormat.extension}...`;
        ctx?.progress(writingMsg, 0.9);
        ctx?.log(writingMsg);

        outputCollection.write(outputMagickFormat, (bytes) => {
          resolve(new Uint8Array(bytes));
        });
      });
    });

    // quantising then optimising, as limitPNG chains pngquant and the lossless optimisers
    if (ctx?.settings.colors && outputFormat.mime === "image/png") {
      ctx.progress("Optimising the PNG...", 0.95);
      bytes = new Uint8Array(await optimise(new Uint8Array(bytes).buffer));
    }

    const name = changeExt(inputFiles[0].name, outputFormat.extension);

    ctx?.progress("Conversion complete!", 1);
    ctx?.log(
      `Successfully converted ${inputFiles.length} files to ${name} (${bytes.length} bytes)`,
    );

    return [{ bytes, name }];
  }
}

export default ImageMagickHandler;
