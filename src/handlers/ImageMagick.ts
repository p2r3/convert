import {
  initializeImageMagick,
  Magick,
  MagickFormat,
  MagickImageCollection,
  MagickReadSettings,
  MagickGeometry
} from "@imagemagick/magick-wasm";

import mime from "mime";
import normalizeMimeType from "../normalizeMimeType.ts";
import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { NumberOption, SelectOption, ToggleOption } from "../FormatHandler.ts";
import type { ConvertContext } from "../ui/ProgressStore.js";

class ImageMagickHandler implements FormatHandler {

  public name: string = "ImageMagick";

  public supportedFormats: FileFormat[] = [];

  public ready: boolean = false;

  private readonly options: {
    resizeMode: "none" | "720p" | "1080p" | "1440p" | "4k" | "custom";
    customWidth: number;
    customHeight: number;
    ignoreAspectRatio: boolean;
    quality: number;
  } = {
    resizeMode: "none",
    customWidth: 1280,
    customHeight: 720,
    ignoreAspectRatio: false,
    quality: 90
  };

  getOptions() {
    return [
      new NumberOption(
        "quality",
        "Quality",
        () => this.options.quality,
        (value) => { this.options.quality = value; },
        {
          min: 1,
          max: 100,
          step: 1,
          unit: "%",
          control: "slider",
          defaultValue: 90,
          description: "Compression quality. Lower values produce smaller files but worse quality."
        }
      ),
      new SelectOption(
        "resize-mode",
        "Resize",
        [
          { label: "Keep original", value: "none", description: "Do not force output size." },
          { label: "1280 x 720 (720p)", value: "720p" },
          { label: "1920 x 1080 (1080p)", value: "1080p" },
          { label: "2560 x 1440 (1440p)", value: "1440p" },
          { label: "3840 x 2160 (4K)", value: "4k" },
          { label: "Custom", value: "custom" }
        ],
        () => this.options.resizeMode,
        (value) => { this.options.resizeMode = value as typeof this.options.resizeMode; },
        {
          defaultValue: "none",
          description: "Resize dimensions for better compatibility or smaller file size."
        }
      ),
      new NumberOption(
        "resize-custom-width",
        "Custom width",
        () => this.options.customWidth,
        (value) => { this.options.customWidth = value; },
        {
          min: 1,
          max: 7680,
          step: 1,
          unit: "px",
          defaultValue: 1280,
          showWhen: (values) => values["resize-mode"] === "custom"
        }
      ),
      new NumberOption(
        "resize-custom-height",
        "Custom height",
        () => this.options.customHeight,
        (value) => { this.options.customHeight = value; },
        {
          min: 1,
          max: 4320,
          step: 1,
          unit: "px",
          defaultValue: 720,
          showWhen: (values) => values["resize-mode"] === "custom"
        }
      ),
      new ToggleOption(
        "ignore-aspect-ratio",
        "Ignore Aspect Ratio",
        () => this.options.ignoreAspectRatio,
        (value) => { this.options.ignoreAspectRatio = value; },
        false,
        "Force the output image to have the target dimensions by stretching instead of scaling proportionally.",
        undefined,
        (values) => values["resize-mode"] !== "none" && values["resize-mode"] !== undefined
      )
    ];
  }

  async init () {

    const wasmLocation = "/convert/wasm/magick.wasm";
    const wasmBuffer = await fetch(wasmLocation).then(r => r.arrayBuffer());
    const wasmBytes = new Uint8Array(wasmBuffer);

    await initializeImageMagick(wasmBytes);

    Magick.supportedFormats.forEach(format => {
      const formatName = format.format.toLowerCase();
      if (formatName === "apng") return;
      if (formatName === "svg") return;
      if (formatName === "ttf") return;
      if (formatName === "otf") return;
      let mimeType = format.mimeType || mime.getType(formatName);
      if (
        !mimeType
        || mimeType.startsWith("text/")
        || mimeType.startsWith("video/")
        || mimeType === "application/json"
      ) return;

      mimeType = normalizeMimeType(mimeType);

      // ImageMagick _really_ likes mislabeling formats
      let description = format.description;
      if (mimeType === "image/jpeg") description = CommonFormats.JPEG.name;
      if (mimeType === "image/gif") description = CommonFormats.GIF.name;
      if (mimeType === "image/webp") description = CommonFormats.WEBP.name;
      if (formatName === "ico") description = "Microsoft Windows ICO";
      if (formatName === "mpo") description = "Multi-Picture Object";
      if (formatName === "vst") description = "Microsoft Visio Template";

      this.supportedFormats.push({
        name: description,
        format: formatName === "jpg" ? "jpeg" : formatName,
        extension: formatName,
        mime: mimeType,
        from: mimeType === "application/pdf" ? false : format.supportsReading,
        to: format.supportsWriting,
        internal: format.format,
        category: mimeType.split("/")[0],
        lossless: ["png", "bmp", "tiff"].includes(formatName)
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

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    args?: string[],
    ctx?: ConvertContext
  ): Promise<FileData[]> {

    const inputMagickFormat = inputFormat.internal as MagickFormat;
    const outputMagickFormat = outputFormat.internal as MagickFormat;

    const inputSettings = new MagickReadSettings();
    inputSettings.format = inputMagickFormat;


    ctx?.log(`Initialising ImageMagick for ${inputFiles.length} files...`);

    const bytes: Uint8Array = await new Promise(resolve => {
      MagickImageCollection.use(outputCollection => {
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
             ctx?.log(`Detected RAW RGB format. Guessed dimensions: ${inputSettings.width}x${inputSettings.height}`, "debug");
          }
          MagickImageCollection.use(fileCollection => {
            fileCollection.read(inputFile.bytes, inputSettings);
            ctx?.log(`Successfully read ${inputFile.name}. Found ${fileCollection.length} sub-images/frames.`, "debug");

            let frameIndex = 0;
            while (fileCollection.length > 0) {
              const image = fileCollection.shift();
              if (!image) break;

              if(outputFormat.format === "ico" && (image.width > 256 || image.height > 256)) {
                ctx?.log(`Image ${inputFile.name} frame ${frameIndex} too large for ICO (${image.width}x${image.height}). Resizing to 256x256...`, "warn");
                const geometry = new MagickGeometry(256, 256);
                image.resize(geometry);
              } else if (this.options.resizeMode !== "none") {
                const target = this.options.resizeMode === "custom"
                  ? { width: this.options.customWidth, height: this.options.customHeight }
                  : { "720p": { width: 1280, height: 720 }, "1080p": { width: 1920, height: 1080 }, "1440p": { width: 2560, height: 1440 }, "4k": { width: 3840, height: 2160 } }[this.options.resizeMode];
                const geometry = new MagickGeometry(target.width, target.height);
                geometry.ignoreAspectRatio = this.options.ignoreAspectRatio;
                image.resize(geometry);
              }

              image.quality = Math.max(1, Math.min(100, Math.round(this.options.quality)));

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

    const baseName = inputFiles[0].name.split(".").slice(0, -1).join(".");
    const name = baseName + "." + outputFormat.extension;

    ctx?.progress("Conversion complete!", 1);
    ctx?.log(`Successfully converted ${inputFiles.length} files to ${name} (${bytes.length} bytes)`);

    return [{ bytes, name }];

  }

}

export default ImageMagickHandler;
