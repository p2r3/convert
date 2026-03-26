import { elementToSVG, inlineResources } from "dom-to-svg";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

function nextPaint(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

async function waitForRenderableAssets(root: ParentNode): Promise<void> {
  const pendingImages = Array.from(root.querySelectorAll("img"))
    .filter(image => !image.complete)
    .map(image => new Promise<void>(resolve => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    }));

  const pendingVideos = Array.from(root.querySelectorAll("video"))
    .filter(video => video.readyState < 2)
    .map(video => new Promise<void>(resolve => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener("error", () => resolve(), { once: true });
    }));

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
  const widthCandidate = element instanceof HTMLElement || element instanceof SVGElement
    ? Math.max(rect.width, element.scrollWidth || 0, element.clientWidth || 0)
    : rect.width;
  const heightCandidate = element instanceof HTMLElement || element instanceof SVGElement
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
  host.style.position = "fixed";
  host.style.left = "-20000px";
  host.style.top = "0";
  host.style.pointerEvents = "none";
  host.style.background = "transparent";
  document.body.appendChild(host);

  try {
    const shadow = host.attachShadow({ mode: "closed" });

    for (const styleElement of Array.from(parsed.querySelectorAll("style"))) {
      shadow.appendChild(styleElement.cloneNode(true));
    }

    const root = document.createElement("div");
    const bodyStyle = parsed.body.getAttribute("style");
    if (bodyStyle) root.setAttribute("style", bodyStyle);

    const sourceNodes = parsed.body.childNodes.length > 0
      ? Array.from(parsed.body.childNodes)
      : Array.from(parsed.documentElement.childNodes);
    for (const childNode of sourceNodes) {
      root.appendChild(childNode.cloneNode(true));
    }

    shadow.appendChild(root);

    return await renderRootToSvgString(root, options);
  } finally {
    host.remove();
  }
}

class HtmlToSvgHandler implements FormatHandler {

  public name: string = "dom-to-svg";

  public supportedFormats: FileFormat[] = [
    CommonFormats.HTML.supported("html", true, false),
    CommonFormats.SVG.supported("svg", false, true, false, {
      category: [Category.IMAGE, Category.VECTOR],
    })
  ];

  public ready: boolean = true;

  async init () {
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {

    if (inputFormat.internal !== "html") throw "Invalid input format.";
    if (outputFormat.internal !== "svg") throw "Invalid output format.";

    const outputFiles: FileData[] = [];

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    for (const inputFile of inputFiles) {
      const { name, bytes } = inputFile;
      const htmlStr = decoder.decode(bytes);
      const svgStr = await htmlContentToSvgString(htmlStr);
      const newName = (name.endsWith(".html") ? name.slice(0, -5) : name) + ".svg";
      outputFiles.push({
        name: newName,
        bytes: encoder.encode(svgStr),
      });
    }

    return outputFiles;

  }

}

export default HtmlToSvgHandler;
