import {
  initializeImageMagick,
  Magick,
  MagickFormat,
  MagickImageCollection,
  MagickReadSettings,
  MagickGeometry,
} from "@imagemagick/magick-wasm";

import mime from "mime";
import magickWasmUrl from "@imagemagick/magick-wasm/magick.wasm?url";
import normalizeMimeType from "../normalizeMimeType.ts";
import Formats, { Category, isCategory } from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { ConvertContext } from "../ui/ProgressStore.js";
import { changeExt } from "src/common/index.ts";

class ImageMagickHandler implements FormatHandler {
  public readonly name = "ImageMagick";
  public supportedFormats: FileFormat[] = [];
  public ready = false;
  public abortable = true;

  async init() {
    const wasmBytes = await fetch(magickWasmUrl).then((r) => r.bytes());

    await initializeImageMagick(wasmBytes);

    this.supportedFormats = [];
    Magick.supportedFormats.forEach((format) => {
      const formatName = format.format.toLowerCase();
      if (formatName === "apng") return;
      if (formatName === "svg") return;
      if (formatName === "ttf") return;
      if (formatName === "otf") return;
      if (formatName === "avi") return;
      let mimeType = format.mimeType || mime.getType(formatName);
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
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const inputMagickFormat = inputFormat.internal as MagickFormat;
    const outputMagickFormat = outputFormat.internal as MagickFormat;

    const inputSettings = new MagickReadSettings();
    inputSettings.format = inputMagickFormat;

    ctx?.log(`Initialising ImageMagick for ${inputFiles.length} files...`);

    const bytes: Uint8Array = await new Promise((resolve) => {
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

    const name = changeExt(inputFiles[0].name, outputFormat.extension);

    ctx?.progress("Conversion complete!", 1);
    ctx?.log(
      `Successfully converted ${inputFiles.length} files to ${name} (${bytes.length} bytes)`,
    );

    return [{ bytes, name }];
  }
}

export default ImageMagickHandler;
