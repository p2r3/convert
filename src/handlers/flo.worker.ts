import initReflo, { decode as refloDecode, encode as refloEncode, get_flo_file_info } from "@flo-audio/reflo";

type Msg =
  | { id: number; type: "ready" }
  | { id: number; type: "error"; error: string }
  | { id: number; type: "decodeResult"; samples: Float32Array; sampleRate: number; channels: number }
  | { id: number; type: "encodeResult"; bytes: Uint8Array };

async function init() {
  try {
    await initReflo('/convert/wasm/reflo_bg.wasm');
    // Signal ready
    (self as any).postMessage({ id: 0, type: 'ready' });
  } catch (e: any) {
    (self as any).postMessage({ id: 0, type: 'error', error: String(e) });
  }
}

init();

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data;
  const id: number = msg.id ?? -1;
  try {
    if (msg.type === 'decode') {
      // msg.bytes: Uint8Array
      const bytes: Uint8Array = msg.bytes;
      const samples = refloDecode(bytes);
      const info = get_flo_file_info(bytes);
      const out: Msg = { id, type: 'decodeResult', samples, sampleRate: info.sample_rate, channels: info.channels };
      // transfer samples.buffer
      (self as any).postMessage(out, [samples.buffer]);
    } else if (msg.type === 'encode') {
      const samples: Float32Array = msg.samples;
      const sampleRate: number = msg.sampleRate;
      const channels: number = msg.channels;
      const bitDepth: number = msg.bitDepth ?? 32;
      const bytes = refloEncode(samples, sampleRate, channels, bitDepth, null);
      const out: Msg = { id, type: 'encodeResult', bytes };
      (self as any).postMessage(out, [bytes.buffer]);
    }
  } catch (e: any) {
    (self as any).postMessage({ id, type: 'error', error: String(e) });
  }
};

export {};
