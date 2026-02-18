import type { FormatHandler, FileFormat, FileData } from "../FormatHandler.js";

// ── internal helpers (adapted from cur-png.js) ───────────────────────────────

async function curToPng(bytes: Uint8Array): Promise<Uint8Array> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const dv = new DataView(buf);

  const type = dv.getUint16(2, true);
  if (type !== 2) throw new Error("Not a CUR file");

  const imageSize   = dv.getUint32(14, true);
  const imageOffset = dv.getUint32(18, true);
  const imageData   = buf.slice(imageOffset, imageOffset + imageSize);

  // Check PNG signature
  const sig    = new Uint8Array(imageData.slice(0, 8));
  const pngSig = [137, 80, 78, 71, 13, 10, 26, 10];
  let isPNG = true;
  for (let i = 0; i < 8; i++) {
    if (sig[i] !== pngSig[i]) { isPNG = false; break; }
  }

  if (isPNG) {
    return new Uint8Array(imageData);
  } else {
    return bmpBitsToPng(imageData);
  }
}

function bmpBitsToPng(bmpBuf: ArrayBuffer): Promise<Uint8Array> {
  const dv = new DataView(bmpBuf);

  // CUR BMP stores height * 2
  const w   = dv.getUint32(18, true);
  const h2  = dv.getUint32(22, true);
  const h   = h2 / 2;

  const bitsOff    = dv.getUint32(10, true);
  const bmpBytes   = new Uint8Array(bmpBuf);

  return new Promise((res, rej) => {
    const canvas = document.createElement("canvas");
    canvas.width  = w;
    canvas.height = h;
    const ctx     = canvas.getContext("2d")!;
    const imgData = ctx.createImageData(w, h);

    const rowSize    = Math.floor((32 * w + 31) / 32) * 4;
    const pixelArray = bmpBytes.slice(bitsOff);

    let dst = 0;
    for (let y = h - 1; y >= 0; y--) {
      const rowStart = y * rowSize;
      for (let x = 0; x < w; x++) {
        const pxOff = rowStart + x * 4;
        imgData.data[dst++] = pixelArray[pxOff + 2]; // R
        imgData.data[dst++] = pixelArray[pxOff + 1]; // G
        imgData.data[dst++] = pixelArray[pxOff + 0]; // B
        imgData.data[dst++] = pixelArray[pxOff + 3]; // A
      }
    }

    ctx.putImageData(imgData, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return rej("Conversion failed");
      blob.arrayBuffer().then(ab => res(new Uint8Array(ab)));
    }, "image/png");
  });
}

async function pngToCur(pngBytes: Uint8Array, hotspotX = 0, hotspotY = 0): Promise<Uint8Array> {
  const pngBuf = pngBytes.buffer.slice(pngBytes.byteOffset, pngBytes.byteOffset + pngBytes.byteLength);
  const dvPNG  = new DataView(pngBuf);

  // PNG IHDR stores width/height big-endian at offsets 16/20
  const width  = dvPNG.getUint32(16);
  const height = dvPNG.getUint32(20);

  const total = 6 + 16 + pngBuf.byteLength;
  const buf   = new ArrayBuffer(total);
  const dv    = new DataView(buf);

  let o = 0;
  dv.setUint16(o, 0, true); o += 2; // reserved
  dv.setUint16(o, 2, true); o += 2; // type: 2 = CUR
  dv.setUint16(o, 1, true); o += 2; // image count

  dv.setUint8(o++, width  >= 256 ? 0 : width);
  dv.setUint8(o++, height >= 256 ? 0 : height);
  dv.setUint8(o++, 0); // color count
  dv.setUint8(o++, 0); // reserved

  dv.setUint16(o, hotspotX, true); o += 2;
  dv.setUint16(o, hotspotY, true); o += 2;

  dv.setUint32(o, pngBuf.byteLength, true); o += 4;
  dv.setUint32(o, 22,                true); o += 4; // image data offset (6 + 16)

  new Uint8Array(buf, 22).set(new Uint8Array(pngBuf));
  return new Uint8Array(buf);
}

/** Convert any browser-renderable image to PNG bytes via canvas. */
function imageToPng(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: mime });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      canvas.toBlob(b => {
        URL.revokeObjectURL(url);
        if (!b) return reject("canvas.toBlob failed");
        b.arrayBuffer().then(ab => resolve(new Uint8Array(ab)));
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject("Image load failed"); };
    img.src = url;
  });
}

/** Re-encode PNG bytes to another format via canvas. */
function pngToFormat(pngBytes: Uint8Array, outputMime: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([pngBytes], { type: "image/png" });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      canvas.toBlob(b => {
        URL.revokeObjectURL(url);
        if (!b) return reject("canvas.toBlob failed");
        b.arrayBuffer().then(ab => resolve(new Uint8Array(ab)));
      }, outputMime);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject("Image load failed"); };
    img.src = url;
  });
}

// ── handler definition ────────────────────────────────────────────────────────

const CurHandler: FormatHandler = {
  name: "CurHandler",
  ready: true,
  init: async () => { CurHandler.ready = true; },

  supportedFormats: [
    {
      name:      "Windows Cursor",
      format:    "cur",
      extension: "cur",
      mime:      "image/x-win-cursor",
      from:      true,
      to:        true,
      internal:  "cur",
    },
    {
      name:      "Portable Network Graphics (CurHandler)",
      format:    "png",
      extension: "png",
      mime:      "image/png",
      from:      true,
      to:        true,
      internal:  "png",
    },
    {
      name:      "JPEG (CurHandler)",
      format:    "jpg",
      extension: "jpg",
      mime:      "image/jpeg",
      from:      true,
      to:        true,
      internal:  "jpg",
    },
    {
      name:      "WebP (CurHandler)",
      format:    "webp",
      extension: "webp",
      mime:      "image/webp",
      from:      true,
      to:        true,
      internal:  "webp",
    },
  ],

  doConvert: async (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> => {
    const results: FileData[] = [];

    for (const file of inputFiles) {
      const baseName = file.name.replace(/\.[^.]+$/, "");

      if (inputFormat.internal === "cur" && outputFormat.internal === "cur") {
        // CUR → CUR: pass through unchanged
        results.push({ name: `${baseName}.cur`, bytes: new Uint8Array(file.bytes) });

      } else if (inputFormat.internal === "cur") {
        // CUR → image: decode to PNG, re-encode if target isn't PNG
        const pngBytes = await curToPng(new Uint8Array(file.bytes));
        const outBytes = outputFormat.mime === "image/png"
          ? pngBytes
          : await pngToFormat(pngBytes, outputFormat.mime);
        results.push({ name: `${baseName}.${outputFormat.extension}`, bytes: outBytes });

      } else if (outputFormat.internal === "cur") {
        // image → CUR: normalise to PNG first, then wrap in CUR container
        const pngBytes = inputFormat.mime === "image/png"
          ? new Uint8Array(file.bytes)
          : await imageToPng(new Uint8Array(file.bytes), inputFormat.mime);
        const curBytes = await pngToCur(pngBytes);
        results.push({ name: `${baseName}.cur`, bytes: curBytes });

      } else {
        // image → image (e.g. PNG → WebP) via canvas
        const pngBytes = inputFormat.mime === "image/png"
          ? new Uint8Array(file.bytes)
          : await imageToPng(new Uint8Array(file.bytes), inputFormat.mime);
        const outBytes = await pngToFormat(pngBytes, outputFormat.mime);
        results.push({ name: `${baseName}.${outputFormat.extension}`, bytes: outBytes });
      }
    }

    return results;
  },
};

export default CurHandler;