/**
 * OCR via Tesseract. Auto-detects the `tesseract` binary; degrades gracefully
 * if not installed by returning a 503 with install instructions.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiError } from "./errors.ts";

const BIN = process.env.TESSERACT_BIN || "tesseract";

export interface OcrOptions {
  bytes: Uint8Array;
  fileExt?: string;
  /** Output mode: txt (default) or pdf (searchable PDF). */
  mode?: "txt" | "pdf" | "hocr" | "tsv";
  /** Tesseract language code(s), e.g. 'eng', 'eng+spa'. */
  lang?: string;
  signal?: AbortSignal;
}

export interface OcrResult {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
  /** Extracted plain text. Empty for non-text modes. */
  text?: string;
}

export async function tesseractAvailable(): Promise<boolean> {
  return new Promise((res) => {
    const p = spawn(BIN, ["--version"]);
    p.on("error", () => res(false));
    p.on("close", (code) => res(code === 0));
  });
}

export async function ocr(opts: OcrOptions): Promise<OcrResult> {
  if (!(await tesseractAvailable())) {
    throw new ApiError(
      503,
      "tesseract not installed. Try 'apt-get install -y tesseract-ocr' or 'brew install tesseract'.",
    );
  }
  const mode = opts.mode ?? "txt";
  const ext = (opts.fileExt || "png").toLowerCase().replace(/^\./, "");
  const workdir = await mkdtemp(join(tmpdir(), "ocr-"));
  const input = join(workdir, `in.${ext}`);
  const outBase = join(workdir, "out");
  try {
    await writeFile(input, opts.bytes);
    const args = [input, outBase, "-l", opts.lang || "eng"];
    if (mode !== "txt") args.push(mode);
    const child = spawn(BIN, args);
    if (opts.signal) opts.signal.addEventListener("abort", () => child.kill("SIGTERM"));
    let stderr = "";
    child.stderr.on("data", (b) => (stderr += b.toString()));
    const code: number = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (c) => resolve(c ?? 1));
    });
    if (code !== 0) {
      throw new ApiError(502, `tesseract exited ${code}: ${stderr.split("\n").slice(-2).join(" ").slice(0, 400)}`);
    }
    if (mode === "txt") {
      const txt = await readFile(outBase + ".txt", "utf8");
      return {
        bytes: new Uint8Array(Buffer.from(txt, "utf8")),
        contentType: "text/plain; charset=utf-8",
        fileName: "ocr.txt",
        text: txt,
      };
    }
    if (mode === "pdf") {
      const buf = await readFile(outBase + ".pdf");
      return { bytes: new Uint8Array(buf), contentType: "application/pdf", fileName: "ocr.pdf" };
    }
    if (mode === "hocr") {
      const buf = await readFile(outBase + ".hocr");
      return { bytes: new Uint8Array(buf), contentType: "text/html", fileName: "ocr.hocr" };
    }
    const buf = await readFile(outBase + ".tsv");
    return { bytes: new Uint8Array(buf), contentType: "text/tab-separated-values", fileName: "ocr.tsv" };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}
