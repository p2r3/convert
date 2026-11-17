import { buildPresentation, parseZip, renderSlide } from "@aiden0z/pptx-renderer";
import { jsPDF } from "jspdf";
import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { changeExt } from "src/common/index.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import { numberOption } from "src/Settings.ts";

const DEFAULT_SCALE = 2;

async function waitForSlideToSettle(element: HTMLElement): Promise<void> {
  const imagePromises = Array.from(element.querySelectorAll("img"))
    .filter((image) => !image.complete)
    .map(
      (image) =>
        new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    );

  await Promise.all(imagePromises);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
}

async function canvasToPngDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode rendered slide as PNG."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read the slide as a data URL.")),
    );
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

export default class pptxRendererHandler implements FormatHandler {
  public readonly name = "pptxRenderer";
  public supportedFormats = [
    Formats.PPTX.builder("pptx").from(),
    Formats.PDF.builder("pdf")
      .options({ scale: { type: "number", label: "Render scale", unit: "×", min: 0.5, max: 4 } })
      .to(),
  ];
  public ready = false;
  public offload = false; // dom heavy
  public abortable = true;

  private html2canvas?: any;

  async init() {
    this.html2canvas = (await import("html2canvas")).default;
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    if (!this.ready) throw new Error("Handler not initialized.");
    if (inputFormat.internal !== "pptx" || outputFormat.internal !== "pdf") {
      throw new Error("Invalid conversion requested.");
    }

    const outputFiles: FileData[] = [];
    const scale = numberOption(ctx?.options, "scale") ?? DEFAULT_SCALE;
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
        await ctx?.checkpoint();
        const files = await parseZip(toArrayBuffer(inputFile.bytes));
        const presentation = buildPresentation(files);

        if (presentation.slides.length === 0) {
          throw new Error(`${inputFile.name} does not contain any slides.`);
        }

        const pageFormat: [number, number] = [presentation.width, presentation.height];
        const orientation = presentation.width >= presentation.height ? "landscape" : "portrait";
        const pdf = new jsPDF({
          orientation,
          unit: "px",
          format: pageFormat,
          compress: true,
        });
        const mediaUrlCache = new Map<string, string>();

        for (const [slideIndex, slide] of presentation.slides.entries()) {
          await ctx?.checkpoint();
          const handle = renderSlide(presentation, slide, { mediaUrlCache });
          try {
            stagingRoot.replaceChildren();
            stagingRoot.style.width = `${presentation.width}px`;
            stagingRoot.style.height = `${presentation.height}px`;
            stagingRoot.appendChild(handle.element);

            await waitForSlideToSettle(handle.element);
            await ctx?.checkpoint();

            const canvas = await this.html2canvas(handle.element, {
              backgroundColor: "#ffffff",
              scale,
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
        outputFiles.push({
          name: changeExt(inputFile.name, "pdf"),
          bytes: pdfBytes,
        });
      }
    } finally {
      stagingRoot.remove();
    }

    return outputFiles;
  }
}
