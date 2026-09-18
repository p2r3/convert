import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import Meyda from "meyda";
import CommonFormats from "src/CommonFormats.ts";
import { WaveFile } from "wavefile";
import { InitializationError } from "src/errors.ts";

const SAMPLE_RATE = 34000;

class meydaHandler implements FormatHandler {
  public name: string = "meyda";
  public supportedFormats: FileFormat[] = [
    // Lossy reconstruction due to 2 channel encoding
    CommonFormats.PNG.supported("image", true, true),
    CommonFormats.JPEG.supported("image", true, true),
    CommonFormats.WEBP.supported("image", true, true),
    CommonFormats.WAV.builder("audio").allowFrom().allowTo(),
  ];
  public ready: boolean = false;
  public offload: boolean = true;

  #canvas?: OffscreenCanvas;
  #ctx?: OffscreenCanvasRenderingContext2D;

  async init() {
    this.#canvas = new OffscreenCanvas(1, 1);
    const ctx = this.#canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to create 2D rendering context.");
    this.#ctx = ctx;

    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (!this.ready || !this.#canvas || !this.#ctx) {
      throw new InitializationError("Handler not initialized.");
    }
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
      for (const inputFile of inputFiles) {
        this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.width);

        const blob = new Blob([inputFile.bytes as BlobPart], { type: inputFormat.mime });

        const image = await createImageBitmap(blob);

        /**
         * After an image-audio-image round-trip, the output height gets
         * constrained to hopSize. To prevent distorting the image, we
         * stretch the image width here to maintain the aspect ratio.
         * For normal audio files, this shouldn't change anything.
         */
        const imageHeight = image.height;
        const imageWidth = Math.round(image.width * (hopSize / imageHeight));

        this.#canvas.width = imageWidth;
        this.#canvas.height = imageHeight;
        this.#ctx.drawImage(image, 0, 0, imageWidth, imageHeight);

        const imageData = this.#ctx.getImageData(0, 0, imageWidth, imageHeight);
        const pixelBuffer = imageData.data as Uint8ClampedArray;

        const audioData = new Float32Array(imageWidth * hopSize + bufferSize);

        // Precompute sine and cosine waves for each frequency
        const sineWaves = new Float32Array(imageHeight * bufferSize);
        const cosineWaves = new Float32Array(imageHeight * bufferSize);
        for (let y = 0; y < imageHeight; y++) {
          const frequency = (y / imageHeight) * (SAMPLE_RATE / 2);
          for (let s = 0; s < bufferSize; s++) {
            const timeInSeconds = s / SAMPLE_RATE;
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

        const wav = new WaveFile();
        wav.fromScratch(1, SAMPLE_RATE, "32f", audioData);

        const bytes = wav.toBuffer();
        const name =
          inputFile.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension;
        outputFiles.push({ bytes, name });
      }
    } else {
      for (const inputFile of inputFiles) {
        const wav = new WaveFile(inputFile.bytes);
        wav.toBitDepth("32f");
        wav.toSampleRate(SAMPLE_RATE);
        const wavFmt = wav.fmt as { sampleRate: number };

        Meyda.bufferSize = bufferSize;
        Meyda.sampleRate = wavFmt.sampleRate;
        const maybeChannels = wav.getSamples(false, Float32Array) as unknown as
          | Float32Array
          | Float32Array[];
        const samples = Array.isArray(maybeChannels) ? maybeChannels[0] : maybeChannels;

        const imageWidth = Math.max(1, Math.ceil((samples.length - bufferSize) / hopSize) + 1);
        const imageHeight = Meyda.bufferSize / 2;

        this.#canvas.width = imageWidth;
        this.#canvas.height = imageHeight;

        const frameBuffer = new Float32Array(bufferSize);

        for (let i = 0; i < imageWidth; i++) {
          const start = i * hopSize;
          frameBuffer.fill(0);
          frameBuffer.set(samples.subarray(start, Math.min(start + bufferSize, samples.length)));
          const spectrum = Meyda.extract("complexSpectrum", frameBuffer);
          if (!spectrum || !("real" in spectrum) || !("imag" in spectrum)) {
            throw new Error("Failed to extract audio features!");
          }
          const real = spectrum.real as Float32Array;
          const imaginary = spectrum.imag as Float32Array;

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
          const imageData = new ImageData(pixels as ImageDataArray, 1, imageHeight);
          this.#ctx.putImageData(imageData, i, 0);
        }

        const blob = await this.#canvas.convertToBlob({
          type: outputFormat.mime,
        });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const name =
          inputFile.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension;
        outputFiles.push({ bytes, name });
      }
    }

    return outputFiles;
  }
}

export default meydaHandler;
