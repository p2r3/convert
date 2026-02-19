import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import Meyda from "meyda";
import CommonFormats from "src/CommonFormats.ts";
import { WaveFile } from "wavefile";

class meydaHandler implements FormatHandler {

  public name: string = "meyda";
  public supportedFormats: FileFormat[] = [
    // Lossy reconstruction due to 2 channel encoding
    CommonFormats.PNG.supported("image", true, true),
    CommonFormats.JPEG.supported("image", true, true),
    CommonFormats.WEBP.supported("image", true, true),
  ];
  public ready: boolean = false;

  #audioContext?: AudioContext;
  #canvas?: HTMLCanvasElement;
  #ctx?: CanvasRenderingContext2D;

  async init() {

    const dummy = document.createElement("audio");
    this.supportedFormats.push(
      CommonFormats.WAV.builder("audio")
        .allowFrom(dummy.canPlayType("audio/wav") !== "")
        .allowTo()
    );

    if (dummy.canPlayType("audio/mpeg")) this.supportedFormats.push(
      // lossless=false, lossy reconstruction 
      CommonFormats.MP3.supported("audio", true, false)
    );
    if (dummy.canPlayType("audio/ogg")) this.supportedFormats.push(
      CommonFormats.OGG.builder("audio").allowFrom()
    );
    if (dummy.canPlayType("audio/flac")) this.supportedFormats.push(
      CommonFormats.FLAC.builder("audio").allowFrom()
    );
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

  async doConvert(
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

        // Detect stereo based on height
        const isStereo = imageHeight === bufferSize; // 2048
        if (!isStereo && imageHeight !== bufferSize / 2) {
          console.warn(`Unexpected image height: ${imageHeight}. Assuming Mono.`);
        }

        const channelHeight = bufferSize / 2;

        this.#canvas.width = imageWidth;
        this.#canvas.height = imageHeight;
        this.#ctx.drawImage(image, 0, 0);

        const imageData = this.#ctx.getImageData(0, 0, imageWidth, imageHeight);
        const pixelBuffer = imageData.data as Uint8ClampedArray;

        const sampleRate = this.#audioContext.sampleRate;

        const leftAudioData = new Float32Array(imageWidth * hopSize + bufferSize);
        const rightAudioData = isStereo ? new Float32Array(imageWidth * hopSize + bufferSize) : null;

        // Precompute sine and cosine waves for each frequency
        const sineWaves = new Float32Array(channelHeight * bufferSize);
        const cosineWaves = new Float32Array(channelHeight * bufferSize);
        for (let y = 0; y < channelHeight; y++) {
          const frequency = (y / channelHeight) * (sampleRate / 2);
          for (let s = 0; s < bufferSize; s++) {
            const timeInSeconds = s / sampleRate;
            const angle = 2 * Math.PI * frequency * timeInSeconds;
            sineWaves[y * bufferSize + s] = Math.sin(angle);
            cosineWaves[y * bufferSize + s] = Math.cos(angle);
          }
        }

        for (let x = 0; x < imageWidth; x++) {
          const leftFrameData = new Float32Array(bufferSize);
          const rightFrameData = isStereo ? new Float32Array(bufferSize) : null;

          // Process Left Channel (Top Half)
          for (let y = 0; y < channelHeight; y++) {
            const pixelIndex = (x + (channelHeight - y - 1) * imageWidth) * 4;

            // Extract amplitude from R and G channels
            const magInt = pixelBuffer[pixelIndex] + (pixelBuffer[pixelIndex + 1] << 8);
            const amplitude = magInt / 65535;
            // Extract phase from B channel
            const phase = (pixelBuffer[pixelIndex + 2] / 255) * (2 * Math.PI) - Math.PI;

            for (let s = 0; s < bufferSize; s++) {
              const waveVal = amplitude * (
                cosineWaves[y * bufferSize + s] * Math.cos(phase)
                - sineWaves[y * bufferSize + s] * Math.sin(phase)
              );
              leftFrameData[s] += waveVal;
            }
          }

          // Process Right Channel (Bottom Half) if stereo
          if (isStereo && rightFrameData) {
            for (let y = 0; y < channelHeight; y++) {

              const visualY = channelHeight - y - 1;
              const globalY = visualY + channelHeight;
              const pixelIndex = (x + globalY * imageWidth) * 4;

              const magInt = pixelBuffer[pixelIndex] + (pixelBuffer[pixelIndex + 1] << 8);
              const amplitude = magInt / 65535;
              const phase = (pixelBuffer[pixelIndex + 2] / 255) * (2 * Math.PI) - Math.PI;

              for (let s = 0; s < bufferSize; s++) {
                const waveVal = amplitude * (
                  cosineWaves[y * bufferSize + s] * Math.cos(phase)
                  - sineWaves[y * bufferSize + s] * Math.sin(phase)
                );
                rightFrameData[s] += waveVal;
              }
            }
          }

          // overlap-add
          const outputOffset = x * hopSize;
          for (let s = 0; s < bufferSize; s++) {
            leftAudioData[outputOffset + s] += leftFrameData[s];
            if (rightAudioData && rightFrameData) {
              rightAudioData[outputOffset + s] += rightFrameData[s];
            }
          }
        }

        // Normalize output
        const normalize = (data: Float32Array) => {
          let max = 0;
          for (let i = 0; i < imageWidth * bufferSize; i++) {
            const magnitude = Math.abs(data[i]);
            if (magnitude > max) max = magnitude;
          }
          if (max > 0) {
            for (let i = 0; i < data.length; i++) {
              data[i] /= max;
            }
          }
        };

        normalize(leftAudioData);
        if (rightAudioData) normalize(rightAudioData);

        const wav = new WaveFile();
        if (isStereo && rightAudioData) {
          wav.fromScratch(2, sampleRate, "32f", [leftAudioData, rightAudioData]);
        } else {
          wav.fromScratch(1, sampleRate, "32f", leftAudioData);
        }

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

        const numChannels = audioData.numberOfChannels;
        const isStereo = numChannels >= 2;

        const leftSamples = audioData.getChannelData(0);
        const rightSamples = isStereo ? audioData.getChannelData(1) : null;

        // We use the length of the longest channel (usually they are same)
        const samplesLength = leftSamples.length;

        const imageWidth = Math.max(1, Math.ceil((samplesLength - bufferSize) / hopSize) + 1);
        const channelHeight = Meyda.bufferSize / 2; // 1024
        const imageHeight = isStereo ? channelHeight * 2 : channelHeight;

        this.#canvas.width = imageWidth;
        this.#canvas.height = imageHeight;

        const leftFrameBuffer = new Float32Array(bufferSize);
        const rightFrameBuffer = isStereo ? new Float32Array(bufferSize) : null;

        // Function to draw a channel to a specific Y offset
        const drawChannel = (samples: Float32Array, yOffset: number) => {
          const frameBuffer = new Float32Array(bufferSize);

          for (let i = 0; i < imageWidth; i++) {
            const start = i * hopSize;
            frameBuffer.fill(0);
            if (start < samples.length) {
              frameBuffer.set(samples.subarray(start, Math.min(start + bufferSize, samples.length)));
            }

            const spectrum = Meyda.extract("complexSpectrum", frameBuffer);
            if (!spectrum || !("real" in spectrum) || !("imag" in spectrum)) {
              continue; // Skip frame if extraction fails
            }
            const real = spectrum.real as Float32Array;
            const imaginary = spectrum.imag as Float32Array;

            const pixels = new Uint8ClampedArray(channelHeight * 4);
            for (let j = 0; j < channelHeight; j++) {
              // Calculate amplitude, amplitude is halved when only half of the FFT is used, so double it
              const magnitude = Math.sqrt(real[j] * real[j] + imaginary[j] * imaginary[j]) / bufferSize * 2;
              const phase = Math.atan2(imaginary[j], real[j]);

              // Map frequency bins to pixel rows, ensuring low frequencies (j=0) are at the bottom.
              const pixelIndex = (channelHeight - j - 1) * 4;

              // Encode magnitude in R, G channels
              const magInt = Math.floor(Math.min(magnitude * 65535, 65535));
              pixels[pixelIndex] = magInt & 0xFF;
              pixels[pixelIndex + 1] = (magInt >> 8) & 0xFF;
              // Encode phase in B channel
              const phaseNormalized = Math.floor(((phase + Math.PI) / (2 * Math.PI)) * 255);
              pixels[pixelIndex + 2] = phaseNormalized;
              pixels[pixelIndex + 3] = 0xFF;
            }
            const imageData = new ImageData(pixels, 1, channelHeight);
            this.#ctx!.putImageData(imageData, i, yOffset);
          }
        };

        drawChannel(leftSamples, 0);
        if (isStereo && rightSamples) {
          drawChannel(rightSamples, channelHeight);
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
