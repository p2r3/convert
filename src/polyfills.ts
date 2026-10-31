import "core-js/actual";
import "abortcontroller-polyfill/dist/abortcontroller-polyfill-only";
import "@ungap/bytes";

// File/Blob.arrayBuffer arrived considerably later than FileReader.
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result as ArrayBuffer), { once: true });
      reader.addEventListener("error", () => reject(reader.error), { once: true });
      reader.readAsArrayBuffer(this);
    });
  };
  Blob.prototype.text = async function () {
    return new TextDecoder().decode(await this.arrayBuffer());
  };
}

if (typeof requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (callback) =>
    setTimeout(() => callback(performance.now()), 16) as unknown as number;
}

// Older AbortController implementations do not have throwIfAborted.
if (!AbortSignal.prototype.throwIfAborted) {
  AbortSignal.prototype.throwIfAborted = function () {
    if (this.aborted) throw this.reason || new DOMException("Conversion cancelled", "AbortError");
  };
}

// A DOM canvas keeps the canvas handlers usable when OffscreenCanvas is absent.
// Return the real element so libraries using drawImage/WebGL still recognize it.
if (typeof OffscreenCanvas === "undefined" && typeof document !== "undefined") {
  globalThis.OffscreenCanvas = function (width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    Object.assign(canvas, {
      convertToBlob: ({ type, quality }: ImageEncodeOptions = {}) =>
        new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("Canvas encoding failed"))),
            type,
            quality,
          );
        }),
    });
    return canvas;
  } as unknown as typeof OffscreenCanvas;
}

if (typeof WebAssembly !== "undefined" && !WebAssembly.compileStreaming) {
  WebAssembly.compileStreaming = async (response) =>
    WebAssembly.compile(await (await response).arrayBuffer());
}

if (typeof HTMLCanvasElement !== "undefined" && !HTMLCanvasElement.prototype.toBlob) {
  HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
    const data = this.toDataURL(type, quality);
    const parts = data.split(",");
    const binary = atob(parts[1]);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    callback(new Blob([bytes], { type: parts[0].slice(5).split(";")[0] }));
  };
}

if (typeof createImageBitmap === "undefined" && typeof document !== "undefined") {
  globalThis.createImageBitmap = (async (source: ImageBitmapSource) => {
    if (!(source instanceof Blob)) throw new Error("This browser can only decode Blob images");
    const url = URL.createObjectURL(source);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => reject(new Error("Could not decode image")), {
          once: true,
        });
        image.src = url;
      });
      return Object.assign(image, { close() {} });
    } finally {
      URL.revokeObjectURL(url);
    }
  }) as unknown as typeof createImageBitmap;
}
