import {
  buildPresentation,
  parseZip,
  renderSlide,
} from "@aiden0z/pptx-renderer";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

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

async function canvasToPngDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("Failed to encode rendered slide as PNG."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
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
    CommonFormats.PDF.supported("pdf", false, true),
  ];

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    _args?: string[],
  ): Promise<FileData[]> {
    if (!this.ready) throw new Error("Handler not initialized.");
    if (inputFormat.internal !== "pptx" || outputFormat.internal !== "pdf") {
      throw new Error("Invalid conversion requested.");
    }

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
        const files = await parseZip(toArrayBuffer(inputFile.bytes));
        const presentation = buildPresentation(files);

        if (presentation.slides.length === 0) {
          throw new Error(`${inputFile.name} does not contain any slides.`);
        }

        const pageFormat: [number, number] = [presentation.width, presentation.height];
        const orientation = presentation.width >= presentation.height
          ? "landscape"
          : "portrait";
        const pdf = new jsPDF({
          orientation,
          unit: "px",
          format: pageFormat,
          compress: true,
        });
        const mediaUrlCache = new Map<string, string>();

        for (const [slideIndex, slide] of presentation.slides.entries()) {
          const handle = renderSlide(presentation, slide, { mediaUrlCache });
          try {
            stagingRoot.replaceChildren();
            stagingRoot.style.width = `${presentation.width}px`;
            stagingRoot.style.height = `${presentation.height}px`;
            stagingRoot.appendChild(handle.element);

            await waitForSlideToSettle(handle.element);

            const canvas = await html2canvas(handle.element, {
              backgroundColor: "#ffffff",
              scale: 2,
              useCORS: true,
              logging: false,
              width: presentation.width,
              height: presentation.height,
              windowWidth: presentation.width,
              windowHeight: presentation.height,
            });
            const pngDataUrl = await canvasToPngDataUrl(canvas);

            if (slideIndex > 0) {
              pdf.addPage(pageFormat, orientation);
            }
            pdf.addImage(
              pngDataUrl,
              "PNG",
              0,
              0,
              presentation.width,
              presentation.height,
              undefined,
              "FAST",
            );
          } finally {
            stagingRoot.replaceChildren();
            handle.dispose();
          }
        }

        const pdfBytes = new Uint8Array(pdf.output("arraybuffer"));
        const baseName = inputFile.name.replace(/\.[^.]+$/u, "");
        outputFiles.push({
          name: `${baseName}.pdf`,
          bytes: pdfBytes,
        });
      }
    } finally {
      stagingRoot.remove();
    }

    return outputFiles;
  }
}
