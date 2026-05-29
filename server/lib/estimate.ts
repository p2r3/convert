/**
 * Heuristic duration estimates. Used by the route layer to decide whether
 * to run a job inline (≤ INLINE_THRESHOLD_MS) or hand back a job descriptor.
 *
 * The numbers are intentionally conservative — we'd rather hand out a 202
 * unnecessarily than block a request for 30s with no progress feedback.
 */

import { isYouTubeUrl } from "./youtube.ts";

export interface EstimateInputs {
  kind: "screenshot" | "sharp" | "browserConvert" | "ytdlp" | "ocr" | "transcribe" | "batch";
  bytes?: number;
  url?: string;
  to?: string;
  /** Sum of child estimates for batch. */
  childrenMs?: number;
}

const MB = 1024 * 1024;

export function estimateMs(inp: EstimateInputs): number {
  switch (inp.kind) {
    case "sharp": {
      // ~100ms for small images on modern hw; grows with bytes.
      const sz = inp.bytes ?? 256 * 1024;
      if (sz <= 256 * 1024) return 80;
      if (sz <= 2 * MB) return 250;
      if (sz <= 10 * MB) return 800;
      if (sz <= 50 * MB) return 3_000;
      return 8_000;
    }
    case "screenshot": {
      // Cold browser launch ~1.5s + page load ~2-5s. YT pages are heavier.
      let base = 3_000;
      if (inp.url && isYouTubeUrl(inp.url)) base = 6_000;
      if (inp.to === "pdf") base += 1_000;
      return base;
    }
    case "browserConvert": {
      // Driving the existing WASM converter is slow on first hit (cache build).
      // Assume warm dist; format graph traversal can still take seconds.
      return 25_000;
    }
    case "ytdlp": {
      // Depends entirely on video length and the chosen format. Treat as long.
      return 60_000;
    }
    case "ocr": {
      // Tesseract on a single page image — a few seconds.
      const sz = inp.bytes ?? 1 * MB;
      return Math.min(20_000, 1_500 + sz / (1 * MB) * 1_500);
    }
    case "transcribe": {
      // API call latency dominates; local whisper is much slower.
      return 30_000;
    }
    case "batch": {
      return Math.max(200, inp.childrenMs ?? 1000);
    }
  }
}
