import {
  buildPresentation,
  parseZip,
  renderSlide,
} from "@aiden0z/pptx-renderer";
import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { ConvertContext } from "../ui/ProgressStore.js";
import { htmlContentToSvgString } from "./htmlToSvg.ts";

async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function convertBlobUrlsToDataUrls(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll("img"));
  for (const img of images) {
    if (img.src.startsWith("blob:")) {
      try {
        img.src = await blobUrlToDataUrl(img.src);
      } catch (_) { /* ignore errors */ }
    }
  }
}

async function waitForSlideToSettle(element: HTMLElement): Promise<void> {
  const imagePromises = Array.from(element.querySelectorAll("img"))
    .filter(image => !image.complete)
    .map(image => new Promise<void>(resolve => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    }));

  await Promise.all(imagePromises);
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
  await new Promise(resolve => setTimeout(resolve, 100));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const sliced = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return sliced as ArrayBuffer;
}

export default class PptxRendererHandler implements FormatHandler {
  public name: string = "pptx-renderer";

  public ready: boolean = true;

  public supportedFormats: FileFormat[] = [
    CommonFormats.PPTX.supported("pptx", true, false),
    CommonFormats.SVG.supported("svg", false, true),
  ];

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    if (!this.ready) throw new Error("Handler not initialized.");
    if (inputFormat.internal !== "pptx") throw new Error("Invalid input format.");
    if (outputFormat.internal !== "svg") throw new Error("Invalid output format.");

    const outputFiles: FileData[] = [];
    const stagingRoot = document.createElement("div");
    stagingRoot.style.position = "fixed";
    stagingRoot.style.left = "-20000px";
    stagingRoot.style.top = "0";
    stagingRoot.style.pointerEvents = "none";
    stagingRoot.style.background = "#ffffff";
    stagingRoot.style.zIndex = "-1";
    document.body.appendChild(stagingRoot);

    try {
      for (const inputFile of inputFiles) {
        ctx?.log(`Parsing ${inputFile.name}...`);
        ctx?.progress("Parsing PPTX...", 0);
        const files = await parseZip(toArrayBuffer(inputFile.bytes));
        const presentation = buildPresentation(files);

        if (presentation.slides.length === 0) {
          throw new Error(`${inputFile.name} does not contain any slides.`);
        }

        const totalSlides = presentation.slides.length;
        ctx?.log(`Found ${totalSlides} slides (${presentation.width}×${presentation.height}px)`);
        const mediaUrlCache = new Map<string, string>();

        for (const [slideIndex, slide] of presentation.slides.entries()) {
          ctx?.throwIfAborted();
          ctx?.progress(`Rendering slide ${slideIndex + 1}/${totalSlides}...`, slideIndex / totalSlides);
          ctx?.log(`Rendering slide ${slideIndex + 1}/${totalSlides}...`);

          const handle = renderSlide(presentation, slide, { mediaUrlCache });
          try {
            stagingRoot.replaceChildren();
            stagingRoot.style.width = `${presentation.width}px`;
            stagingRoot.style.height = `${presentation.height}px`;
            stagingRoot.appendChild(handle.element);

            await waitForSlideToSettle(handle.element);
            await convertBlobUrlsToDataUrls(handle.element);

            const slideHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;overflow:hidden}*{box-sizing:border-box}</style></head><body style="width:${presentation.width}px;height:${presentation.height}px;">${handle.element.outerHTML}</body></html>`;

            const svgString = await htmlContentToSvgString(slideHtml, {
              width: presentation.width,
              height: presentation.height,
            });

            const baseName = inputFile.name.replace(/\.[^.]+$/u, "");
            const svgName = totalSlides === 1
              ? `${baseName}.svg`
              : `${baseName}_slide${slideIndex + 1}.svg`;

            outputFiles.push({
              name: svgName,
              bytes: new TextEncoder().encode(svgString),
            });
          } finally {
            stagingRoot.replaceChildren();
            handle.dispose();
          }
        }
      }
    } finally {
      stagingRoot.remove();
    }

    ctx?.progress("Slides rendered to SVG", 1);
    ctx?.log(`Generated ${outputFiles.length} SVG file(s)`);
    return outputFiles;
  }
}
