import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import JSZip from "jszip";
import { toScratchblocks } from "parse-sb3-blocks";
import scratchblocks from "scratchblocks";
import html2canvas from "html2canvas";
import MeydaHandler from "./meyda";

function mimeForFormat(fmt: string): string {
    const f = fmt?.toLowerCase?.() ?? "";
    if (f === "png") return "image/png";
    if (f === "svg") return "image/svg+xml;charset=utf-8";
    if (f === "jpg" || f === "jpeg") return "image/jpeg";
    if (f === "gif") return "image/gif";
    if (f === "webp") return "image/webp";
    return "application/octet-stream";
}

function audioMimeForFormat(fmt: string): string {
    const f = fmt?.toLowerCase?.() ?? "";
    if (f === "wav") return "audio/wav";
    if (f === "mp3") return "audio/mpeg";
    if (f === "ogg") return "audio/ogg";
    if (f === "flac") return "audio/flac";
    return "application/octet-stream";
}

class sb3ToPngHandler implements FormatHandler {
    public name = "sb3topng";
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
                internal: "sb3"
            },
            {
                name: "Portable Network Graphics",
                format: "png",
                extension: "png",
                mime: "image/png",
                from: false,
                to: true,
                internal: "image"
            }
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

        const objectUrls: string[] = [];
        const loadPromises: Promise<void>[] = [];

        const meyda = new MeydaHandler();
        try { await meyda.init(); } catch {}

        const container = document.createElement("div");
        container.style.position = "fixed";
        container.style.left = "-20000px";
        container.style.top = "-20000px";
        container.style.background = "#ffffff";
        container.style.padding = "24px";
        container.style.fontFamily = "Arial, sans-serif";
        container.style.color = "#000";
        container.style.width = "fit-content";

        for (const target of project.targets) {
            const section = document.createElement("div");
            section.style.marginBottom = "72px";

            const title = document.createElement("h2");
            title.textContent = target.isStage ? "Stage" : `Sprite: ${target.name || "unnamed"}`;
            title.style.borderBottom = "2px solid #000";
            title.style.paddingBottom = "8px";
            title.style.margin = "0 0 12px 0";
            section.appendChild(title);

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
                        try {
                            const text = toScratchblocks(blockId, blocks, "en", { tabs: "    " });
                            if (text && text.trim().length > 0) scratchTexts.push(text);
                        } catch {}
                    }
                }
            }

            if (scratchTexts.length > 0) {
                const pre = document.createElement("pre");
                pre.className = "blocks";
                pre.textContent = scratchTexts.join("\n\n");
                pre.style.margin = "0 0 18px 0";
                section.appendChild(pre);
            }

            if (target.costumes && target.costumes.length > 0) {
                const costumeHeader = document.createElement("h3");
                costumeHeader.textContent = target.isStage ? "Backdrops" : "Costumes";
                costumeHeader.style.margin = "18px 0 8px 0";
                section.appendChild(costumeHeader);

                const costumeGrid = document.createElement("div");
                costumeGrid.style.display = "flex";
                costumeGrid.style.flexWrap = "wrap";
                costumeGrid.style.gap = "16px";
                costumeGrid.style.alignItems = "flex-start";

                for (const costume of target.costumes) {
                    const assetPath = `${costume.assetId}.${costume.dataFormat}`;
                    const assetFile = zip.file(assetPath);
                    if (!assetFile) continue;

                    const wrapper = document.createElement("div");
                    wrapper.style.display = "flex";
                    wrapper.style.flexDirection = "column";
                    wrapper.style.alignItems = "center";
                    wrapper.style.width = "220px";

                    const label = document.createElement("div");
                    label.textContent = costume.name || "";
                    label.style.marginBottom = "6px";
                    label.style.fontSize = "13px";
                    label.style.textAlign = "center";

                    const img = document.createElement("img");
                    img.style.maxWidth = "200px";
                    img.style.maxHeight = "200px";
                    img.style.objectFit = "contain";
                    img.style.display = "block";
                    img.style.background = "#fff";
                    img.alt = costume.name || "";

                    const format = costume.dataFormat || "";
                    const mime = mimeForFormat(format);

                    const p = assetFile.async(format === "svg" ? "text" : "arraybuffer").then(async (data) => {
                        try {
                            const blob = format === "svg"
                                ? new Blob([data as string], { type: mime })
                                : new Blob([data as ArrayBuffer], { type: mime });

                            const url = URL.createObjectURL(blob);
                            objectUrls.push(url);
                            img.src = url;
                            await new Promise<void>((resolve) => {
                                const t = setTimeout(() => resolve(), 5000);
                                img.onload = () => { clearTimeout(t); resolve(); };
                                img.onerror = () => { clearTimeout(t); resolve(); };
                            });
                        } catch {}
                    });

                    loadPromises.push(p);
                    wrapper.appendChild(label);
                    wrapper.appendChild(img);
                    costumeGrid.appendChild(wrapper);
                }

                section.appendChild(costumeGrid);
            }

            if (target.sounds && target.sounds.length > 0) {
                const soundHeader = document.createElement("h3");
                soundHeader.textContent = "Sounds";
                soundHeader.style.margin = "18px 0 8px 0";
                section.appendChild(soundHeader);

                const soundGrid = document.createElement("div");
                soundGrid.style.display = "flex";
                soundGrid.style.flexWrap = "wrap";
                soundGrid.style.gap = "12px";

                for (const sound of target.sounds) {
                    const md5ext = sound.md5ext || `${sound.assetId}.${sound.format}`;
                    const assetFile = zip.file(md5ext);
                    if (!assetFile) {
                        const label = document.createElement("div");
                        label.textContent = sound.name || "(missing audio)";
                        soundGrid.appendChild(label);
                        continue;
                    }

                    const label = document.createElement("div");
                    label.textContent = sound.name || "";
                    label.style.marginBottom = "6px";
                    label.style.fontSize = "13px";
                    label.style.textAlign = "center";

                    const img = document.createElement("img");
                    img.style.maxWidth = "200px";
                    img.style.maxHeight = "200px";
                    img.style.objectFit = "contain";
                    img.style.display = "block";
                    img.style.background = "#fff";
                    img.alt = sound.name || "";

                    const p = assetFile.async("arraybuffer").then(async (ab) => {
                        try {
                            const bytes = new Uint8Array(ab);
                            const inputFile: FileData = {
                                name: (sound.name || "sound") + "." + (sound.format || "wav"),
                                bytes
                            };
                            const inputFmt: FileFormat = {
                                name: sound.format || "audio",
                                format: sound.format || "wav",
                                extension: sound.format || "wav",
                                mime: audioMimeForFormat(sound.format || "wav"),
                                from: true,
                                to: false,
                                internal: "audio"
                            };
                            const outFmt: FileFormat = {
                                name: "Portable Network Graphics",
                                format: "png",
                                extension: "png",
                                mime: "image/png",
                                from: false,
                                to: true,
                                internal: "image"
                            };

                            try {
                                const out = await meyda.doConvert([inputFile], inputFmt, outFmt);
                                if (out && out[0] && out[0].bytes) {
                                    const blob = new Blob(
                                        [out[0].bytes.buffer as ArrayBuffer],
                                        { type: outFmt.mime }
                                    );
                                    const url = URL.createObjectURL(blob);
                                    objectUrls.push(url);
                                    img.src = url;
                                    await new Promise<void>((resolve) => {
                                        const t = setTimeout(() => resolve(), 5000);
                                        img.onload = () => { clearTimeout(t); resolve(); };
                                        img.onerror = () => { clearTimeout(t); resolve(); };
                                    });
                                } else {
                                    // fallback: show name if conversion failed
                                    const fallback = document.createElement("div");
                                    fallback.textContent = sound.name || "(audio)";
                                    soundGrid.appendChild(fallback);
                                    return;
                                }
                            } catch {
                                const fallback = document.createElement("div");
                                fallback.textContent = sound.name || "(audio)";
                                soundGrid.appendChild(fallback);
                                return;
                            }

                        } catch {}
                    });

                    loadPromises.push(p);
                    const wrapper = document.createElement("div");
                    wrapper.style.display = "flex";
                    wrapper.style.flexDirection = "column";
                    wrapper.style.alignItems = "center";
                    wrapper.style.width = "220px";
                    wrapper.appendChild(label);
                    wrapper.appendChild(img);
                    soundGrid.appendChild(wrapper);
                }

                section.appendChild(soundGrid);
            }

            container.appendChild(section);
        }

        const preAll = document.createElement("pre");
        preAll.className = "blocks";
        const allScratchTexts: string[] = [];
        for (const target of project.targets) {
            if (!target.blocks) continue;
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
                    try {
                        const text = toScratchblocks(blockId, blocks, "en", { tabs: "    " });
                        if (text && text.trim().length > 0) allScratchTexts.push(text);
                    } catch {}
                }
            }
        }
        if (allScratchTexts.length > 0) preAll.textContent = allScratchTexts.join("\n\n");
        const existingPres = container.querySelectorAll("pre.blocks");
        existingPres.forEach(p => p.remove());
        container.appendChild(preAll);

        document.body.appendChild(container);

        await Promise.all(loadPromises);
        await scratchblocks.renderMatching("pre.blocks", { style: "scratch3", languages: ["en"] });

        const width = container.scrollWidth;
        const height = container.scrollHeight;

        const MAX_DIMENSION = 16000;
        const MAX_PIXELS = 200_000_000;

        let scale = 2;
        if (
            width * height * scale * scale > MAX_PIXELS ||
            width * scale > MAX_DIMENSION ||
            height * scale > MAX_DIMENSION
        ) {
            const scaleByDimension = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
            const scaleByPixels = Math.sqrt(MAX_PIXELS / (width * height));
            scale = Math.min(scaleByDimension, scaleByPixels, 2);
        }

        const canvas = await html2canvas(container, { backgroundColor: "#ffffff", scale });

        const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
        const buffer = await blob.arrayBuffer();

        document.body.removeChild(container);

        for (const url of objectUrls) URL.revokeObjectURL(url);

        return [{
            name: inputFile.name.replace(/\.sb3$/i, "") + ".png",
            bytes: new Uint8Array(buffer)
        }];
    }
}

export default sb3ToPngHandler;
