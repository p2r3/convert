// https://github.com/neko782/xz-wasm

import { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } from "@bjorn3/browser_wasi_shim";

let instance: any | null = null;

// https://github.com/tukaani-project/xz/blob/bfc5f12a84a2a9df774ed16cd6eb58fd5ab24646/src/liblzma/api/lzma/base.h#L55
export enum LzmaRet {
  LZMA_OK = 0,
  LZMA_STREAM_END = 1,
  LZMA_NO_CHECK = 2,
  LZMA_UNSUPPORTED_CHECK = 3,
  LZMA_GET_CHECK = 4,
  LZMA_MEM_ERROR = 5,
  LZMA_MEMLIMIT_ERROR = 6,
  LZMA_FORMAT_ERROR = 7,
  LZMA_OPTIONS_ERROR = 8,
  LZMA_DATA_ERROR = 9,
  LZMA_BUF_ERROR = 10,
  LZMA_PROG_ERROR = 11,
  LZMA_SEEK_NEEDED = 12,
}

// https://github.com/tukaani-project/xz/blob/bfc5f12a84a2a9df774ed16cd6eb58fd5ab24646/src/liblzma/api/lzma/check.h#L25
export enum LzmaCheck {
  LZMA_CHECK_NONE = 0,
  LZMA_CHECK_CRC32 = 1,
  LZMA_CHECK_CRC64 = 4,
  LZMA_CHECK_SHA256 = 10,
}

export async function init() {
  if(instance) { return; }

  const fds = [
    new OpenFile(new File([])), // stdin
    ConsoleStdout.lineBuffered(msg => console.log(`[WASI stdout] ${msg}`)),
    ConsoleStdout.lineBuffered(msg => console.warn(`[WASI stderr] ${msg}`))
  ];
  const wasi = new WASI([], [], fds);

  const wasm = await WebAssembly.compileStreaming(fetch("/convert/wasm/liblzma.wasm"));
  instance = await WebAssembly.instantiate(wasm, {
    "wasi_snapshot_preview1": wasi.wasiImport,
  }) as any; // id die making a type for a wasm

  wasi.initialize(instance);
}

export function compress(input: Uint8Array): Uint8Array {
  const e = instance.exports;

  const compressedSize = e.lzma_stream_buffer_bound(input.length);

  const inputBuf = e.malloc(input.length);
  const outputBuf = e.malloc(compressedSize);
  const outPosBuf = e.malloc(4);

  try {
    new Uint8Array(e.memory.buffer, inputBuf, input.length).set(input);
    new DataView(e.memory.buffer).setUint32(outPosBuf, 0, true);

    /*  
    lzma_easy_buffer_encode(
      uint32_t preset, lzma_check check,
      const lzma_allocator *allocator,
      const uint8_t *in, size_t in_size,
      uint8_t *out, size_t *out_pos, size_t out_size
    )
    */
    const ret = e.lzma_easy_buffer_encode(
      6, LzmaCheck.LZMA_CHECK_CRC64, 
      0,
      inputBuf, input.length,
      outputBuf, outPosBuf, compressedSize
    ) as LzmaRet;

    switch(ret) {
      case LzmaRet.LZMA_OK:
        const outPos = new DataView(e.memory.buffer).getUint32(outPosBuf, true);
        const output = new Uint8Array(new Uint8Array(e.memory.buffer, outputBuf, outPos));

        return output;
      default:
        throw new Error(`liblzma failed: ${LzmaRet[ret]}`);
    }
  } finally {
    e.free(inputBuf);
    e.free(outputBuf);
    e.free(outPosBuf);
  }
}

export function decompress(input: Uint8Array): Uint8Array {
  const e = instance.exports;

  let outputLength = input.length * 3; // we cant really predict output length so we just guess

  while (outputLength < 1.9 * 1024 * 1024 * 1024) { 
    const inputBuf = e.malloc(input.length);
    const outputBuf = e.malloc(outputLength);
    const inPosBuf = e.malloc(4);
    const outPosBuf = e.malloc(4);
    const memlimitBuf = e.malloc(8);

    try {
      new Uint8Array(e.memory.buffer, inputBuf, input.length).set(input);
      new DataView(e.memory.buffer).setUint32(outPosBuf, 0, true);
      new DataView(e.memory.buffer).setUint32(inPosBuf, 0, true);
      new DataView(e.memory.buffer).setBigUint64(memlimitBuf, 2n ** 64n - 1n, true);

      /* 
      lzma_stream_buffer_decode(
        uint64_t *memlimit, uint32_t flags,
        const lzma_allocator *allocator,
        const uint8_t *in, size_t *in_pos, size_t in_size,
        uint8_t *out, size_t *out_pos, size_t out_size
      )
      */
      const ret = e.lzma_stream_buffer_decode(
        memlimitBuf, 0, 
        0,
        inputBuf, inPosBuf, input.length,
        outputBuf, outPosBuf, outputLength
      ) as LzmaRet;

      switch(ret) {
        case LzmaRet.LZMA_OK:
          const outPos = new DataView(e.memory.buffer).getUint32(outPosBuf, true);
          const output = new Uint8Array(new Uint8Array(e.memory.buffer, outputBuf, outPos));

          return output;
        case LzmaRet.LZMA_BUF_ERROR:
          console.warn(`didnt allocate enough for xz decompression! trying ${outputLength * 2}...`);
          break;
        default:
          throw new Error(`liblzma failed: ${LzmaRet[ret]}`);
      }
    } finally {
      e.free(inputBuf);
      e.free(outputBuf);
      e.free(inPosBuf);
      e.free(outPosBuf);
      e.free(memlimitBuf);
    }

    outputLength = Math.floor(outputLength * 1.5);
  }

  throw new Error("could not decompress xz in 50 iterations");
}