/**
 * Speech-to-text. Tries (in order):
 *   1. OpenAI Whisper API   (OPENAI_API_KEY)
 *   2. Local `whisper`      (CLI from openai-whisper / whisper.cpp)
 *
 * Optional summarization via Claude when ANTHROPIC_API_KEY is present.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiError } from "./errors.ts";
import { log } from "./log.ts";

export interface TranscribeOptions {
  bytes: Uint8Array;
  fileExt?: string;
  /** ISO 639-1 code; auto-detect if omitted. */
  language?: string;
  /** Also produce a Claude-generated summary. */
  summarize?: boolean;
  signal?: AbortSignal;
}

export interface TranscribeResult {
  text: string;
  language?: string;
  summary?: string;
  backend: "openai" | "whisper-cli" | "none";
}

const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const WHISPER_BIN = process.env.WHISPER_BIN || "whisper";

export async function whisperCliAvailable(): Promise<boolean> {
  return new Promise((res) => {
    const p = spawn(WHISPER_BIN, ["--help"]);
    p.on("error", () => res(false));
    p.on("close", (code) => res(code === 0));
  });
}

export async function transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
  let text = "";
  let language = opts.language;
  let backend: TranscribeResult["backend"] = "none";

  if (OPENAI_KEY) {
    const result = await transcribeViaOpenAi(opts);
    text = result.text;
    language = result.language ?? language;
    backend = "openai";
  } else if (await whisperCliAvailable()) {
    const result = await transcribeViaCli(opts);
    text = result.text;
    backend = "whisper-cli";
  } else {
    throw new ApiError(
      503,
      "No speech-to-text backend available. Set OPENAI_API_KEY for the API path or install whisper (pip install -U openai-whisper).",
    );
  }

  let summary: string | undefined;
  if (opts.summarize && text.trim() && ANTHROPIC_KEY) {
    try {
      summary = await summarizeWithClaude(text);
    } catch (e) {
      log.warn("Claude summarization failed:", e);
    }
  }

  return { text, language, summary, backend };
}

async function transcribeViaOpenAi(opts: TranscribeOptions): Promise<{ text: string; language?: string }> {
  const form = new FormData();
  form.set(
    "file",
    new Blob([new Uint8Array(opts.bytes)], { type: guessAudioMime(opts.fileExt) }),
    `audio.${opts.fileExt || "mp3"}`,
  );
  form.set("model", process.env.OPENAI_WHISPER_MODEL || "whisper-1");
  if (opts.language) form.set("language", opts.language);
  form.set("response_format", "json");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${OPENAI_KEY}` },
    body: form,
    signal: opts.signal,
  });
  if (!res.ok) throw new ApiError(502, `OpenAI Whisper API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { text: string; language?: string };
  return { text: json.text, language: json.language };
}

async function transcribeViaCli(opts: TranscribeOptions): Promise<{ text: string }> {
  const ext = (opts.fileExt || "mp3").replace(/^\./, "");
  const workdir = await mkdtemp(join(tmpdir(), "whisper-"));
  const input = join(workdir, `audio.${ext}`);
  try {
    await writeFile(input, opts.bytes);
    const args = ["-f", input, "-otxt", "-of", join(workdir, "out")];
    if (opts.language) args.push("-l", opts.language);
    const child = spawn(WHISPER_BIN, args);
    if (opts.signal) opts.signal.addEventListener("abort", () => child.kill("SIGTERM"));
    let stderr = "";
    child.stderr.on("data", (b) => (stderr += b.toString()));
    const code: number = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (c) => resolve(c ?? 1));
    });
    if (code !== 0) {
      throw new ApiError(502, `whisper exited ${code}: ${stderr.slice(-400)}`);
    }
    const txt = await readFile(join(workdir, "out.txt"), "utf8").catch(() => "");
    return { text: txt };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

async function summarizeWithClaude(text: string): Promise<string> {
  const truncated = text.length > 200_000 ? text.slice(0, 200_000) + "\n[truncated]" : text;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Summarize the following transcript in 5-10 concise bullet points.\n\n${truncated}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  return json.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
}

function guessAudioMime(ext?: string): string {
  switch ((ext || "").toLowerCase()) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
    case "mp4":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "flac":
      return "audio/flac";
    case "ogg":
    case "opus":
      return "audio/ogg";
    case "webm":
      return "audio/webm";
    default:
      return "application/octet-stream";
  }
}
