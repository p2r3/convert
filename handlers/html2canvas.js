import html2canvas from "/node_modules/html2canvas/dist/html2canvas.esm.js";

const supportedFormats = [
  {
    name: "Hypertext Markup Language",
    format: "html",
    extension: "html",
    mime: "text/html",
    from: true,
    to: false,
    internal: "html"
  },
  {
    name: "Portable Network Graphics",
    format: "png",
    extension: "png",
    mime: "image/png",
    from: false,
    to: true,
    internal: "png"
  },
  {
    name: "Joint Photographic Experts Group JFIF",
    format: "jpeg",
    extension: "jpg",
    mime: "image/jpeg",
    from: false,
    to: true,
    internal: "jpeg"
  },
  {
    name: "WebP",
    format: "webp",
    extension: "webp",
    mime: "image/webp",
    from: false,
    to: true,
    internal: "webp"
  },
];

async function init () {

}

async function doConvert (inputFile, inputFormat, outputFormat) {

  const node = document.createElement("div");
  node.innerHTML = new TextDecoder().decode(inputFile.bytes);

  document.body.appendChild(node);
  const canvas = await html2canvas(node);
  node.remove();

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject("Canvas output failed");
      blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
    }, outputFormat.mime);
  });

}

export default {
  name: "html2canvas",
  init,
  supportedFormats,
  doConvert
};
