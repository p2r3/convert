import { elementToSVG, inlineResources } from "dom-to-svg";
import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { decode, encode } from "src/common/index.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

async function waitForRenderableAssets(root: ParentNode): Promise<void> {
  const pendingImages = Array.from(root.querySelectorAll("img"))
    .filter((image) => !image.complete)
    .map(
      (image) =>
        new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    );

  const pendingVideos = Array.from(root.querySelectorAll("video"))
    .filter((video) => video.readyState < 2)
    .map(
      (video) =>
        new Promise<void>((resolve) => {
          video.addEventListener("loadeddata", () => resolve(), { once: true });
          video.addEventListener("error", () => resolve(), { once: true });
        }),
    );

  await Promise.all([...pendingImages, ...pendingVideos]);
  await nextPaint();
}

type HtmlToSvgOptions = {
  width?: number;
  height?: number;
  backgroundColor?: string;
};

function measureRenderedElement(
  element: Element,
  options: HtmlToSvgOptions,
): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  const widthCandidate =
    element instanceof HTMLElement || element instanceof SVGElement
      ? Math.max(rect.width, element.scrollWidth || 0, element.clientWidth || 0)
      : rect.width;
  const heightCandidate =
    element instanceof HTMLElement || element instanceof SVGElement
      ? Math.max(rect.height, element.scrollHeight || 0, element.clientHeight || 0)
      : rect.height;

  return {
    width: Math.max(1, Math.ceil(options.width ?? widthCandidate)),
    height: Math.max(1, Math.ceil(options.height ?? heightCandidate)),
  };
}

async function renderRootToSvgString(
  root: HTMLElement,
  options: HtmlToSvgOptions,
): Promise<string> {
  await waitForRenderableAssets(root);
  // lay out at the requested width, so the height is measured for it
  if (options.width) {
    root.style.width = `${options.width}px`;
    await nextPaint();
  }

  const { width, height } = measureRenderedElement(root, options);
  const existingStyle = root.getAttribute("style") || "";
  const bg = options.backgroundColor ? `background-color:${options.backgroundColor};` : "";
  root.setAttribute(
    "style",
    `${existingStyle}${bg}width:${width}px;height:${height}px;box-sizing:border-box;`,
  );

  await nextPaint();

  const bounds = root.getBoundingClientRect();
  const svgDocument = elementToSVG(root, { captureArea: bounds });
  await inlineResources(svgDocument.documentElement);
  return new XMLSerializer().serializeToString(svgDocument);
}

async function htmlContentToSvgString(
  htmlContent: string,
  options: HtmlToSvgOptions = {},
): Promise<string> {
  const parsed = new DOMParser().parseFromString(htmlContent, "text/html");
  const host = document.createElement("div");
  host.style.all = "initial";
  host.style.background = "transparent";

  const frame = document.createElement("iframe");
  frame.sandbox.add("allow-same-origin");
  frame.style.position = "fixed";
  frame.style.left = "-20000px";
  frame.style.top = "0";
  frame.style.pointerEvents = "none";
  frame.style.width = `${window.innerWidth}px`;
  frame.style.height = `${window.innerHeight}px`;
  document.body.appendChild(frame);

  try {
    frame.contentDocument!.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "closed" });

    const html = parsed.documentElement.cloneNode(true) as HTMLElement;
    shadow.appendChild(html);
    const root = html.querySelector("body")!;

    return await renderRootToSvgString(root, options);
  } finally {
    frame.remove();
  }
}

class htmlToSvgHandler implements FormatHandler {
  public readonly name = "htmlToSvg";
  public supportedFormats = [
    Formats.HTML.builder("html").from(),
    Formats.SVG.builder("svg").options({ width: true, height: true }).to(),
  ];
  public ready = false;
  public offload = false; // very dom heavy

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    if (inputFormat.internal !== "html") throw "Invalid input format.";
    if (outputFormat.internal !== "svg") throw "Invalid output format.";

    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const { name, bytes } = inputFile;
      const htmlStr = decode(bytes);
      const svgStr = await htmlContentToSvgString(htmlStr, {
        width: ctx?.options.width,
        height: ctx?.options.height,
      });
      const newName = (name.endsWith(".html") ? name.slice(0, -5) : name) + ".svg";
      outputFiles.push({
        name: newName,
        bytes: encode(svgStr),
      });
    }

    return outputFiles;
  }
}

export default htmlToSvgHandler;
