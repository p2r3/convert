import { Router } from "express";
import { isBrowserConverterAvailable } from "../lib/browserConvert.ts";
import { ytdlpAvailable } from "../lib/ytdlp.ts";
import { tesseractAvailable } from "../lib/ocr.ts";
import { whisperCliAvailable } from "../lib/transcribe.ts";
import { resultCache } from "../lib/cache.ts";
import { browserPoolStats } from "../lib/browser.ts";

export const healthRouter: Router = Router();

healthRouter.get("/health", async (_req, res) => {
  const [ytdlp, tesseract, whisper] = await Promise.all([
    ytdlpAvailable(),
    tesseractAvailable(),
    whisperCliAvailable(),
  ]);
  res.json({
    ok: true,
    time: new Date().toISOString(),
    capabilities: {
      browserConverter: isBrowserConverterAvailable(),
      ytdlp,
      tesseract,
      whisperCli: whisper,
      openaiWhisper: !!process.env.OPENAI_API_KEY,
      claudeSummary: !!process.env.ANTHROPIC_API_KEY,
    },
    cache: resultCache.stats(),
    browserPool: browserPoolStats(),
  });
});
