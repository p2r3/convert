import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { decodeVTF } from "./vtf.ts";

function parseBasetexture (vmtBytes: Uint8Array): string | null {
  const text = new TextDecoder().decode(vmtBytes);
  const quoted = text.match(/\$basetexture\s*["']([^"']+)["']/i);
  if (quoted) return quoted[1].replace(/\\/g, "/");
  const unquoted = text.match(/\$basetexture\s+([^\s"']+)/i);
  return unquoted ? unquoted[1].replace(/\\/g, "/") : null;
}

function showVtfModal (requiredVtfName: string): Promise<FileData> {
  const vtfDisplay = requiredVtfName.endsWith(".vtf") ? requiredVtfName : requiredVtfName + ".vtf";
  const html = `
    <h2>Provide VTF texture</h2>
    <p><b>Required:</b> ${vtfDisplay}</p>
    <div id="vmt-vtf-drop" style="border: 2px dashed #ccc; padding: 20px; margin: 10px; cursor: pointer; user-select: none;">Drop VTF here or click to select</div>
    <input type="file" id="vmt-vtf-input" accept=".vtf" style="display:none">
    <button id="vmt-vtf-cancel">Cancel</button>
  `;
  (window as any).showPopup(html);
  const popup = document.querySelector("#popup");
  const fileInput = popup?.querySelector("#vmt-vtf-input") as HTMLInputElement;
  const dropZone = popup?.querySelector("#vmt-vtf-drop") as HTMLDivElement;
  const cancelBtn = popup?.querySelector("#vmt-vtf-cancel") as HTMLButtonElement;
  return new Promise((resolve, reject) => {
    const finish = (fd: FileData | null) => {
      (window as any).hidePopup();
      if (fd) resolve(fd);
      else reject("Cancelled");
    };
    const handleFile = async (file: File | undefined) => {
      if (!file || !file.name.toLowerCase().endsWith(".vtf")) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      finish({ name: file.name, bytes });
    };
    dropZone.onclick = () => fileInput?.click();
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = "#1C77FF"; };
    dropZone.ondragleave = () => { dropZone.style.borderColor = "#ccc"; };
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "#ccc";
      handleFile(e.dataTransfer?.files?.[0]);
    };
    fileInput!.onchange = () => handleFile(fileInput.files?.[0]);
    cancelBtn!.onclick = () => finish(null);
  });
}

class vmtHandler implements FormatHandler {

  public name: string = "vmt";

  public supportedFormats: FileFormat[] = [
    {
      name: "Valve Material",
      format: "vmt",
      extension: "vmt",
      mime: "text/x-valve-material",
      from: true,
      to: false,
      internal: "vmt",
      category: "image"
    },
    CommonFormats.PNG.supported("png", false, true, true),
    CommonFormats.JPEG.supported("jpeg", false, true),
    CommonFormats.WEBP.supported("webp", false, true)
  ];

  #canvas?: HTMLCanvasElement;
  #ctx?: CanvasRenderingContext2D;

  public ready: boolean = false;

  async init () {
    this.#canvas = document.createElement("canvas");
    this.#ctx = this.#canvas.getContext("2d") || undefined;
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (!this.#canvas || !this.#ctx) throw "Handler not initialized.";
    const firstVmt = inputFiles[0];
    const basetexture = parseBasetexture(firstVmt.bytes);
    if (!basetexture) throw "No $basetexture found in VMT.";
    const vtfFile = await showVtfModal(basetexture);
    const outputFiles: FileData[] = [];
    const decoded = decodeVTF(vtfFile.bytes);
    this.#canvas.width = decoded.width;
    this.#canvas.height = decoded.height;
    const imageData = new ImageData(new Uint8ClampedArray(decoded.pixels), decoded.width, decoded.height);
    this.#ctx.putImageData(imageData, 0, 0);
    const bytes: Uint8Array = await new Promise((resolve, reject) => {
      this.#canvas!.toBlob((blob) => {
        if (!blob) return reject("Canvas output failed");
        blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
      }, outputFormat.mime);
    });
    for (const inputFile of inputFiles) {
      const name = inputFile.name.split(".")[0] + "." + outputFormat.extension;
      outputFiles.push({ bytes: new Uint8Array(bytes), name });
    }
    return outputFiles;
  }

}

export default vmtHandler;
