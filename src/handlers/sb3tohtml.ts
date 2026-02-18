import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import JSZip from "jszip";
import * as mime from "mime";
import normalizeMimeType from "../normalizeMimeType.ts";

function resolveMime(fmt: string): string {
    const ext = String(fmt ?? "").toLowerCase();
    const anyMime = mime as unknown as Record<string, any>;

    const guessed =
        anyMime.getType?.(ext) ??
        anyMime.get?.(ext) ??
        anyMime.default?.getType?.(ext) ??
        anyMime.default?.get?.(ext) ??
        null;

    return normalizeMimeType(guessed ?? "application/octet-stream");
}

class sb3ToHtmlHandler implements FormatHandler {
    public name = "sb3tohtml";
    public supportedFormats?: FileFormat[];
    public ready = false;

    async init() {
        this.supportedFormats = [
            {
                name: "Scratch 3 Project",
                format: "sb3",
                extension: "sb3",
                mime: "application/x.scratch.sb3",
                from: true,
                to: false,
                internal: "sb3",
            },
            {
                name: "Hypertext Markup Language",
                format: "html",
                extension: "html",
                mime: "text/html",
                from: false,
                to: true,
                internal: "html",
            },
        ];
        this.ready = true;
    }

    async doConvert(
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const inputFile = inputFiles[0];
        const zip = await JSZip.loadAsync(inputFile.bytes);

        const projectJsonStr = await zip.file("project.json")!.async("string");
        const project = JSON.parse(projectJsonStr);

        function arrayBufferToBase64(ab: ArrayBuffer): string {
            const bytes = new Uint8Array(ab);
            const chunk = 0x8000;
            let binary = "";
            for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
            }
            return btoa(binary);
        }

        async function fileToDataUrl(filePath: string, fmtGuess?: string): Promise<string | null> {
            const f = zip.file(filePath);
            if (!f) return null;
            const ab = await f.async("arraybuffer");
            const mime = resolveMime(fmtGuess ?? filePath);
            const b64 = arrayBufferToBase64(ab);
            return `data:${mime};base64,${b64}`;
        }

        const parts: string[] = [];
        parts.push(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(inputFile.name.replace(/\.sb3$/i, ""))}</title>
<style>
  body { font-family: Arial, sans-serif; color: #111; background: #fff; padding: 24px; }
  .project { max-width: 1200px; margin: 0 auto; }
  .target { margin-bottom: 48px; border-bottom: 1px solid #ddd; padding-bottom: 24px; }
  .target h2 { margin: 0 0 12px 0; }
  .costume-grid, .sound-grid { display:flex; flex-wrap:wrap; gap:16px; align-items:flex-start; }
  .asset { width:220px; display:flex; flex-direction:column; align-items:center; }
  pre.blocks { white-space: pre-wrap; word-break: break-word; background:#f7f7f7; padding:12px; border-radius:6px; }
</style>
</head>
<body>
<div class="project">
<h1>${escapeHtml(inputFile.name.replace(/\.sb3$/i, ""))}</h1>
`);

        for (const target of project.targets || []) {
            parts.push(`<section class="target">`);
            const title = target.isStage ? "Stage" : `Sprite: ${escapeHtml(target.name || "unnamed")}`;
            parts.push(`<h2>${title}</h2>`);

            const scratchTexts: string[] = [];
            if (target.blocks) {
                const blocks = target.blocks;
                for (const blockId in blocks) {
                    const block = blocks[blockId];
                    if (
                        block &&
                        block.topLevel === true &&
                        block.parent === null &&
                        block.shadow !== true &&
                        typeof block.opcode === "string"
                    ) {
                        scratchTexts.push(JSON.stringify(block, null, 2));
                    }
                }
            }
            if (scratchTexts.length > 0) {
                parts.push(`<pre class="blocks">${escapeHtml(scratchTexts.join("\n\n"))}</pre>`);
            }

            if (target.costumes && target.costumes.length > 0) {
                parts.push(`<h3>${target.isStage ? "Backdrops" : "Costumes"}</h3>`);
                parts.push(`<div class="costume-grid">`);
                for (const costume of target.costumes) {
                    const assetPath = `${costume.assetId}.${costume.dataFormat}`;
                    const file = zip.file(assetPath);
                    if (!file) continue;

                    const ab = await file.async("arraybuffer");
                    const mimeType = resolveMime(costume.dataFormat || assetPath);
                    const b64 = arrayBufferToBase64(ab);
                    const dataUrl = `data:${mimeType};base64,${b64}`;

                    parts.push(`<div class="asset">
            <div style="margin-bottom:6px;font-size:13px;text-align:center;">${escapeHtml(costume.name || "")}</div>
            <img src="${dataUrl}" alt="${escapeHtml(costume.name || "")}" style="max-width:200px;max-height:200px;object-fit:contain;background:#fff;display:block;" />
          </div>`);
                }
                parts.push(`</div>`);
            }

            if (target.sounds && target.sounds.length > 0) {
                parts.push(`<h3>Sounds</h3>`);
                parts.push(`<div class="sound-grid">`);
                for (const sound of target.sounds) {
                    const md5ext = sound.md5ext || `${sound.assetId}.${sound.format}`;
                    const file = zip.file(md5ext);
                    if (!file) {
                        parts.push(`<div class="asset"><div>${escapeHtml(sound.name || "(missing audio)")}</div></div>`);
                        continue;
                    }
                    const ab = await file.async("arraybuffer");
                    const mime = resolveMime(sound.format || md5ext);
                    const b64 = arrayBufferToBase64(ab);
                    const dataUrl = `data:${mime};base64,${b64}`;

                    parts.push(`<div class="asset">
            <div style="margin-bottom:6px;font-size:13px;text-align:center;">${escapeHtml(sound.name || "")}</div>
            <audio controls src="${dataUrl}">Your browser does not support the audio element.</audio>
          </div>`);
                }
                parts.push(`</div>`);
            }

            parts.push(`</section>`);
        }

        parts.push(`</div>
</body>
</html>`);

        const html = parts.join("\n");
        const encoder = new TextEncoder();
        const htmlBytes = encoder.encode(html);

        return [
            {
                name: inputFile.name.replace(/\.sb3$/i, "") + ".html",
                bytes: new Uint8Array(htmlBytes),
            },
        ];
    }
}

export default sb3ToHtmlHandler;

function escapeHtml(s: string): string {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
