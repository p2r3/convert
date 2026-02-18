import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import Meyda from "meyda";
import CommonFormats from "src/CommonFormats.ts";
import { WaveFile } from "wavefile";

class meydaHandler implements FormatHandler {

  public name: string = "meyda";
  public supportedFormats: FileFormat[] = [
    CommonFormats.PNG.supported("image", true, true),
    CommonFormats.JPEG.supported("image", true, true),
    CommonFormats.WEBP.supported("image", true, true),
  ];
  public ready: boolean = false;

  #audioContext?: AudioContext;
  #canvas?: HTMLCanvasElement;
  #ctx?: CanvasRenderingContext2D;

  async init () {

    const dummy = document.createElement("audio");
    this.supportedFormats.push({
      name: "Waveform Audio File Format",
      format: "wav",
      extension: "wav",
      mime: "audio/wav",
      from: dummy.canPlayType("audio/wav") !== "",
      to: true,
      internal: "audio",
      category: "audio",
      lossless: false // Lossy reconstruction
    });
    if (dummy.canPlayType("audio/mpeg")) this.supportedFormats.push(
      CommonFormats.MP3.supported("audio", true, false)
    );
    if (dummy.canPlayType("audio/ogg")) this.supportedFormats.push({
      name: "Ogg Audio",
      format: "ogg",
      extension: "ogg",
      mime: "audio/ogg",
      from: true,
      to: false,
      internal: "audio",
      category: "audio",
      lossless: false // Lossy reconstruction
    });
    if (dummy.canPlayType("audio/flac")) this.supportedFormats.push({
      name: "Free Lossless Audio Codec",
      format: "flac",
      extension: "flac",
      mime: "audio/flac",
      from: true,
      to: false,
      internal: "audio",
      category: "audio",
      lossless: false // Lossy reconstruction
    });
    dummy.remove();

    this.#audioContext = new AudioContext({
      sampleRate: 44100
    });

    this.#canvas = document.createElement("canvas");
    const ctx = this.#canvas.getContext("2d");
    if (!ctx) throw "Failed to create 2D rendering context.";
    this.#ctx = ctx;

    this.ready = true;

  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (
      !this.ready
      || !this.#audioContext
      || !this.#canvas
      || !this.#ctx
    ) {
      throw "Handler not initialized!";
    }
    const outputFiles: FileData[] = [];

    const inputIsImage = (inputFormat.internal === "image");
    const outputIsImage = (outputFormat.internal === "image");

    const bufferSize = 2048;
    const hopSize = bufferSize / 2;

    if (inputIsImage === outputIsImage) {
      throw "Invalid input/output format.";
    }

    if (inputIsImage) {
      for (const inputFile of inputFiles) {

        this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.width);

        const blob = new Blob([inputFile.bytes as BlobPart], { type: inputFormat.mime });
        const url = URL.createObjectURL(blob);

        const image = new Image();
        await new Promise((resolve, reject) => {
          image.addEventListener("load", resolve);
          image.addEventListener("error", reject);
          image.src = url;
        });

        const imageWidth = image.naturalWidth;
        const imageHeight = image.naturalHeight;

        this.#canvas.width = imageWidth;
        this.#canvas.height = imageHeight;
        this.#ctx.drawImage(image, 0, 0);

        const imageData = this.#ctx.getImageData(0, 0, imageWidth, imageHeight);
        const pixelBuffer = imageData.data as Uint8ClampedArray;

        const sampleRate = this.#audioContext.sampleRate;

        const audioData = new Float32Array(imageWidth * hopSize + bufferSize);

        // Precompute sine and cosine waves for each frequency
        const sineWaves = new Float32Array(imageHeight * bufferSize);
        const cosineWaves = new Float32Array(imageHeight * bufferSize);
        for (let y = 0; y < imageHeight; y ++) {
          const frequency = (y / imageHeight) * (sampleRate / 2);
          for (let s = 0; s < bufferSize; s ++) {
            const timeInSeconds = s / sampleRate;
            const angle = 2 * Math.PI * frequency * timeInSeconds;
            sineWaves[y * bufferSize + s] = Math.sin(angle);
            cosineWaves[y * bufferSize + s] = Math.cos(angle);
          }
        }

        for (let x = 0; x < imageWidth; x ++) {
          const frameData = new Float32Array(bufferSize);

          for (let y = 0; y < imageHeight; y ++) {
            const pixelIndex = (x + (imageHeight - y - 1) * imageWidth) * 4;

            // Extract amplitude from R and G channels
            const magInt = pixelBuffer[pixelIndex] + (pixelBuffer[pixelIndex + 1] << 8);
            const amplitude = magInt / 65535;
            // Extract phase from B channel
            const phase = (pixelBuffer[pixelIndex + 2] / 255) * (2 * Math.PI) - Math.PI;

            for (let s = 0; s < bufferSize; s ++) {
              frameData[s] += amplitude * (
                cosineWaves[y * bufferSize + s] * Math.cos(phase)
                - sineWaves[y * bufferSize + s] * Math.sin(phase)
              );
            }
          }

          // overlap-add
          const outputOffset = x * hopSize;
          for (let s = 0; s < bufferSize; s ++) {
            audioData[outputOffset + s] += frameData[s];
          }
        }

        // Normalize output
        let max = 0;
        for (let i = 0; i < imageWidth * bufferSize; i ++) {
          const magnitude = Math.abs(audioData[i]);
          if (magnitude > max) max = magnitude;
        }
        for (let i = 0; i < audioData.length; i ++) {
          audioData[i] /= max;
        }

        const wav = new WaveFile();
        wav.fromScratch(1, sampleRate, "32f", audioData);

        const bytes = wav.toBuffer();
        const name = inputFile.name.split(".")[0] + "." + outputFormat.extension;
        outputFiles.push({ bytes, name });

      }
    } else {
      for (const inputFile of inputFiles) {

        const inputBytes = new Uint8Array(inputFile.bytes);
        const audioData = await this.#audioContext.decodeAudioData(inputBytes.buffer);

        Meyda.bufferSize = bufferSize;
        Meyda.sampleRate = audioData.sampleRate;
        const samples = audioData.getChannelData(0);
        const imageWidth = Math.max(1, Math.ceil((samples.length - bufferSize) / hopSize) + 1);
        const imageHeight = Meyda.bufferSize / 2;

        this.#canvas.width = imageWidth;
        this.#canvas.height = imageHeight;

        const frameBuffer = new Float32Array(bufferSize);

        for (let i = 0; i < imageWidth; i ++) {

          const start = i * hopSize;
          frameBuffer.fill(0);
          frameBuffer.set(samples.subarray(start, Math.min(start + bufferSize, samples.length)));
          const spectrum = Meyda.extract("complexSpectrum", frameBuffer);
          if (!spectrum || !("real" in spectrum) || !("imag" in spectrum)) {
            throw "Failed to extract audio features!";
          }
          const real = spectrum.real as Float32Array;
          const imaginary = spectrum.imag as Float32Array;

          const pixels = new Uint8ClampedArray(imageHeight * 4);
          for (let j = 0; j < imageHeight; j ++) {
            // Calculate amplitude, amplitude is halved when only half of the FFT is used, so double it
            const magnitude = Math.sqrt(real[j] * real[j] + imaginary[j] * imaginary[j]) / bufferSize * 2;
            const phase = Math.atan2(imaginary[j], real[j]);
            const pixelIndex = (imageHeight - j - 1) * 4;
            // Encode magnitude in R, G channels
            const magInt = Math.floor(Math.min(magnitude * 65535, 65535));
            pixels[pixelIndex] = magInt & 0xFF;
            pixels[pixelIndex + 1] = (magInt >> 8) & 0xFF;
            // Encode phase in B channel
            const phaseNormalized = Math.floor(((phase + Math.PI) / (2 * Math.PI)) * 255);
            pixels[pixelIndex + 2] = phaseNormalized;
            pixels[pixelIndex + 3] = 0xFF;
          }
          const imageData = new ImageData(pixels as ImageDataArray, 1, imageHeight);
          this.#ctx.putImageData(imageData, i, 0);

        }

        const bytes: Uint8Array = await new Promise((resolve, reject) => {
          this.#canvas!.toBlob((blob) => {
            if (!blob) return reject("Canvas output failed.");
            blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
          }, outputFormat.mime);
        });
        const name = inputFile.name.split(".")[0] + "." + outputFormat.extension;
        outputFiles.push({ bytes, name });

      }
    }


    return outputFiles;
  }

}

export default meydaHandler;
