import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

class svgForeignObjectHandler implements FormatHandler {

  public name: string = "svgForeignObject";

  public supportedFormats: FileFormat[] = [
    CommonFormats.HTML.supported("html", true, false),
    CommonFormats.SVG.supported("svg", false, true, true)
  ];

  public ready: boolean = true;

  async init () {
    this.ready = true;
  }

  static async normalizeHTML (html: string) {
    // To get the size of the input document, we need the
    // browser to actually render it.
    // Create a hidden "dummy" element on the DOM.
    const dummy = document.createElement("div");
    dummy.style.all = "initial";
    dummy.style.visibility = "hidden";
    dummy.style.position = "fixed";
    document.body.appendChild(dummy);

    // Add a DOM shadow to the dummy to "sterilize" it.
    const shadow = dummy.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = ":host>div{display:flow-root;}";
    shadow.appendChild(style);

    // Create a div within the shadow DOM to act as
    // a container for our HTML payload.
    const container = document.createElement("div");
    container.innerHTML = html;
    shadow.appendChild(container);

    // Wait for all images to finish loading. This is required for layout
    // changes, not because we actually care about the image contents.
    const images = container.querySelectorAll("img, video");
    const promises = Array.from(images).map(image => new Promise(resolve => {
      image.addEventListener("load", resolve);
      image.addEventListener("loadeddata", resolve);
      image.addEventListener("error", resolve);
    }));
    await Promise.all(promises);

    // Make sure the browser has had time to render.
    // This is probably redundant due to the async calls above.
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

    // Finally, get the bounding box of the input and serialize it to XML.
    const bbox = container.getBoundingClientRect();
    const serializer = new XMLSerializer();
    const xml = serializer.serializeToString(container);

    container.remove();
    dummy.remove();

    return { xml, bbox };
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    if (inputFormat.internal !== "html") throw "Invalid input format.";
    if (outputFormat.internal !== "svg") throw "Invalid output format.";

    const outputFiles: FileData[] = [];

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    for (const inputFile of inputFiles) {
      const { name, bytes } = inputFile;
      const html = decoder.decode(bytes);
      const { xml, bbox } = await svgForeignObjectHandler.normalizeHTML(html);
      const svg = (
        `<svg width="${bbox.width}" height="${bbox.height}" xmlns="http://www.w3.org/2000/svg">
        <foreignObject x="0" y="0" width="${bbox.width}" height="${bbox.height}">
        ${xml}
        </foreignObject>
        </svg>`);
      const outputBytes = encoder.encode(svg);
      const newName = (name.endsWith(".html") ? name.slice(0, -5) : name) + ".svg";
      outputFiles.push({ name: newName, bytes: outputBytes });
    }

    return outputFiles;

  }

}

export default svgForeignObjectHandler;
