import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import Meyda from "meyda";
import Formats from "src/Formats.ts";
import { InitializationError } from "src/errors.ts";
import { changeExt, ownedBytes } from "src/common/index.ts";
import { canvasToBlob, createCanvas, type CanvasBundle } from "src/common/canvas.ts";
import { Settings } from "src/Settings.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import { typedWaveFile } from "src/common/wav.ts";

const SAMPLE_RATE = 34000;

class meydaHandler implements FormatHandler {
  public readonly name = "meyda";
  public supportedFormats = [
    // Lossy reconstruction due to 2 channel encoding
    Formats.PNG.builder("image").fromTo(),
    Formats.JPEG.builder("image").fromTo(),
    Formats.WEBP.builder("image").fromTo(),
    // Other rates change the frequency range the image covers, but don't survive a round trip,
    // since audio is read back at SAMPLE_RATE
    Formats.WAV.builder("audio")
      .options({ sampleRate: { ...Settings.sampleRate, min: 8000, max: 96000 } })
      .fromTo(),
  ];
  public ready = false;

  #bundle?: CanvasBundle;

  async init() {
    this.#bundle = createCanvas();

    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    convertCtx?: ConvertContext,
  ): Promise<FileData[]> {
    if (!this.ready || !this.#bundle) {
      throw new InitializationError("Handler not initialized.");
    }
    const { canvas, ctx } = this.#bundle;
    const outputFiles: FileData[] = [];

    const inputIsImage = inputFormat.internal === "image";
    const outputIsImage = outputFormat.internal === "image";

    const bufferSize = 2048;
    const hopSize = bufferSize / 2;

    if (inputIsImage === outputIsImage) {
      throw new TypeError(
        `Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`,
      );
    }

    if (inputIsImage) {
      const sampleRate = convertCtx?.options.sampleRate ?? SAMPLE_RATE;
      for (const inputFile of inputFiles) {
        const blob = new Blob([inputFile.bytes], { type: inputFormat.mime });

        const image = await createImageBitmap(blob);

        /**
         * After an image-audio-image round-trip, the output height gets
         * constrained to hopSize. To prevent distorting the image, we
         * stretch the image width here to maintain the aspect ratio.
         * For normal audio files, this shouldn't change anything.
         */
        const imageHeight = image.height;
        const imageWidth = Math.round(image.width * (hopSize / imageHeight));

        canvas.width = imageWidth;
        canvas.height = imageHeight;
        ctx.drawImage(image, 0, 0, imageWidth, imageHeight);

        const imageData = ctx.getImageData(0, 0, imageWidth, imageHeight);
        const pixelBuffer = imageData.data as Uint8ClampedArray;

        const audioData = new Float32Array(imageWidth * hopSize + bufferSize);

        // Precompute sine and cosine waves for each frequency
        const sineWaves = new Float32Array(imageHeight * bufferSize);
        const cosineWaves = new Float32Array(imageHeight * bufferSize);
        for (let y = 0; y < imageHeight; y++) {
          const frequency = (y / imageHeight) * (sampleRate / 2);
          for (let s = 0; s < bufferSize; s++) {
            const timeInSeconds = s / sampleRate;
            const angle = 2 * Math.PI * frequency * timeInSeconds;
            sineWaves[y * bufferSize + s] = Math.sin(angle);
            cosineWaves[y * bufferSize + s] = Math.cos(angle);
          }
        }

        for (let x = 0; x < imageWidth; x++) {
          const frameData = new Float32Array(bufferSize);

          for (let y = 0; y < imageHeight; y++) {
            const pixelIndex = (x + (imageHeight - y - 1) * imageWidth) * 4;

            // Extract amplitude from R and G channels
            const magInt = pixelBuffer[pixelIndex] + (pixelBuffer[pixelIndex + 1] << 8);
            const amplitude = magInt / 65535;
            // Extract phase from B channel
            const phase = (pixelBuffer[pixelIndex + 2] / 255) * (2 * Math.PI) - Math.PI;

            for (let s = 0; s < bufferSize; s++) {
              frameData[s] +=
                amplitude *
                (cosineWaves[y * bufferSize + s] * Math.cos(phase) -
                  sineWaves[y * bufferSize + s] * Math.sin(phase));
            }
          }

          // overlap-add
          const outputOffset = x * hopSize;
          for (let s = 0; s < bufferSize; s++) {
            audioData[outputOffset + s] += frameData[s];
          }
        }

        /**
         * It makes absolutely zero sense to normalize the output here.
         * This undermines the entire color encoding system, and as a
         * result nearly always produces a dark, noisy blue-red image.
         * Just removing this step would fix the color accuracy of
         * image-audio-image round-trips.
         *
         * However:
         * - For some reason, audio quality is far better when normalized.
         * - If converting from a normal image, the user's ears would get
         *   blown out without normalization.
         *
         * For those reasons, I'm keeping it in. I pray that one day
         * someone smarter than me comes along with a solution.
         */
        let max = 0;
        for (let i = 0; i < imageWidth * bufferSize; i++) {
          const magnitude = Math.abs(audioData[i]);
          if (magnitude > max) max = magnitude;
        }
        for (let i = 0; i < audioData.length; i++) {
          audioData[i] /= max;
        }

        const wav = typedWaveFile();
        wav.fromScratch(1, sampleRate, "32f", audioData);

        const bytes = ownedBytes(wav.toBuffer());
        const name = changeExt(inputFile.name, outputFormat.extension);
        outputFiles.push({ bytes, name });
      }
    } else {
      for (const inputFile of inputFiles) {
        const wav = typedWaveFile(inputFile.bytes);
        wav.toBitDepth("32f");
        wav.toSampleRate(SAMPLE_RATE);

        Meyda.bufferSize = bufferSize;
        Meyda.sampleRate = wav.fmt.sampleRate;

        const maybeChannels = wav.getSamples(false, Float32Array);
        const samples = Array.isArray(maybeChannels) ? maybeChannels[0] : maybeChannels;

        const imageWidth = Math.max(1, Math.ceil((samples.length - bufferSize) / hopSize) + 1);
        const imageHeight = Meyda.bufferSize / 2;

        canvas.width = imageWidth;
        canvas.height = imageHeight;

        const frameBuffer = new Float32Array(bufferSize);

        for (let i = 0; i < imageWidth; i++) {
          const start = i * hopSize;
          frameBuffer.fill(0);
          frameBuffer.set(samples.subarray(start, Math.min(start + bufferSize, samples.length)));
          const spectrum = Meyda.extract(["complexSpectrum"], frameBuffer)?.complexSpectrum;
          if (!spectrum) {
            throw new Error("Failed to extract audio features!");
          }
          const real = spectrum.real;
          const imaginary = spectrum.imag;

          const pixels = new Uint8ClampedArray(imageHeight * 4);
          for (let j = 0; j < imageHeight; j++) {
            // Calculate amplitude, amplitude is halved when only half of the FFT is used, so double it
            const magnitude =
              (Math.sqrt(real[j] * real[j] + imaginary[j] * imaginary[j]) / bufferSize) * 2;
            const phase = Math.atan2(imaginary[j], real[j]);
            const pixelIndex = (imageHeight - j - 1) * 4;
            // Encode magnitude in R, G channels
            const magInt = Math.floor(Math.min(magnitude * 65535, 65535));
            pixels[pixelIndex] = magInt & 0xff;
            pixels[pixelIndex + 1] = (magInt >> 8) & 0xff;
            // Encode phase in B channel
            const phaseNormalized = Math.floor(((phase + Math.PI) / (2 * Math.PI)) * 255);
            pixels[pixelIndex + 2] = phaseNormalized;
            pixels[pixelIndex + 3] = 0xff;
          }
          const imageData = new ImageData(pixels, 1, imageHeight);
          ctx.putImageData(imageData, i, 0);
        }

        const bytes = await canvasToBlob(this.#bundle, outputFormat.mime);
        const name = changeExt(inputFile.name, outputFormat.extension);
        outputFiles.push({ bytes, name });
      }
    }

    return outputFiles;
  }
}

export default meydaHandler;
