/**
 * Wraps the `yt-dlp` binary to download audio/video from YouTube and the
 * many other sites it supports. Streams progress and aborts on signal.
 *
 * Install yt-dlp separately (it's not bundled). On the host:
 *   pip install -U yt-dlp        # or
 *   curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiError, badRequest } from "./errors.ts";
import { log } from "./log.ts";

const BIN = process.env.YTDLP_BIN || "yt-dlp";

export interface YtdlpOptions {
  url: string;
  /** Output format: mp3, m4a, mp4, webm, best, bestaudio, etc. */
  format?: string;
  /** Quality preset: best, worst, "720p", "1080p" etc. */
  quality?: string;
  signal?: AbortSignal;
  onProgress?: (fraction: number, status: string) => void;
  /** Max total bytes to accept; default 500MB. */
  maxBytes?: number;
}

export interface YtdlpResult {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  metadata: {
    title?: string;
    duration?: number;
    extractor?: string;
  };
}

export async function ytdlpAvailable(): Promise<boolean> {
  return new Promise((res) => {
    const p = spawn(BIN, ["--version"]);
    p.on("error", () => res(false));
    p.on("close", (code) => res(code === 0));
  });
}

export async function ytdlpFetch(opts: YtdlpOptions): Promise<YtdlpResult> {
  if (!(await ytdlpAvailable())) {
    throw new ApiError(
      503,
      `yt-dlp not installed. Install with 'pip install -U yt-dlp' or download from https://github.com/yt-dlp/yt-dlp/releases`,
    );
  }
  if (!opts.url) throw badRequest("Missing url");

  const workdir = await mkdtemp(join(tmpdir(), "ytdlp-"));
  const maxBytes = opts.maxBytes ?? 500 * 1024 * 1024;
  try {
    const args = [
      "--no-playlist",
      "--no-warnings",
      "--max-filesize",
      `${Math.round(maxBytes / 1024)}K`,
      "-o",
      "%(title).200B [%(id)s].%(ext)s",
      "--restrict-filenames",
      "--progress",
      "--newline",
    ];
    const fmt = (opts.format || "best").toLowerCase();
    const audioOnly = ["mp3", "m4a", "wav", "flac", "ogg", "opus", "aac"].includes(fmt);
    if (audioOnly) {
      args.push("-x", "--audio-format", fmt);
    } else if (fmt === "best" || fmt === "worst") {
      args.push("-f", fmt);
    } else if (/^\d+p$/.test(opts.quality || "")) {
      args.push("-f", `bestvideo[height<=${(opts.quality || "").replace("p", "")}]+bestaudio/best`);
      args.push("--merge-output-format", fmt === "webm" ? "webm" : "mp4");
    } else {
      args.push("-f", fmt);
    }
    args.push(opts.url);

    log.info(`yt-dlp ${args.join(" ")}`);
    const child = spawn(BIN, args, { cwd: workdir });
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => child.kill("SIGTERM"));
    }
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        // Parse e.g. "[download]  42.0% of 12.34MiB at 1.23MiB/s ETA 00:05"
        const m = /\[download\]\s+([\d.]+)%/.exec(line);
        if (m && opts.onProgress) {
          const pct = Number(m[1]);
          if (!Number.isNaN(pct)) opts.onProgress(pct / 100, line.trim());
        }
      }
    });
    const code: number = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (c) => resolve(c ?? 1));
    });
    if (code !== 0) {
      throw new ApiError(
        502,
        `yt-dlp exited with code ${code}: ${stderr.split("\n").slice(-3).join(" ").slice(0, 400)}`,
      );
    }
    const files = (await readdir(workdir)).filter((f) => !f.endsWith(".part") && !f.endsWith(".ytdl"));
    if (files.length === 0) throw new ApiError(502, "yt-dlp produced no output");
    // Pick the largest (skip .info.json metadata side-files).
    const picks = files.filter((f) => !f.endsWith(".info.json"));
    const target = picks[0] || files[0];
    const bytes = new Uint8Array(await readFile(join(workdir, target)));
    return {
      bytes,
      fileName: target,
      contentType: guessContentType(target),
      metadata: { extractor: "yt-dlp" },
    };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

function guessContentType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    flac: "audio/flac",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    aac: "audio/aac",
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    mov: "video/quicktime",
  };
  return map[ext] ?? "application/octet-stream";
}
