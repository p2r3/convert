import handler_ImageMagick from "./handlers/ImageMagick.js";
import handler_FFmpeg from "./handlers/FFmpeg.js";
import handler_canvg from "./handlers/canvg.js";
import handler_pdftoimg from "./handlers/pdftoimg.js";
import handler_rename from "./handlers/rename.js";
import handler_canvasToBlob from "./handlers/canvasToBlob.js";
import handler_html2canvas from "./handlers/html2canvas.js";

const handlers = [
  handler_ImageMagick,
  handler_FFmpeg,
  handler_canvg,
  handler_pdftoimg,
  handler_rename,
  handler_canvasToBlob,
  handler_html2canvas
];

let selectedFile;

const fileInput = document.querySelector("#file-input");
const fileSelectArea = document.querySelector("#file-area");
const convertButton = document.querySelector("#convert-button");
const modeToggleButton = document.querySelector("#mode-button");

const inputList = document.querySelector("#from-list");
const outputList = document.querySelector("#to-list");
const inputSearch = document.querySelector("#search-from");
const outputSearch = document.querySelector("#search-to");

const searchHandler = function (event) {
  const string = event.target.value.toLowerCase();
  const list = event.target.parentElement.querySelector(".format-list");
  for (const button of Array.from(list.children)) {
    if (!button.textContent.toLowerCase().includes(string)) {
      button.style.display = "none";
    } else {
      button.style.display = "";
    }
  }
};

inputSearch.oninput = searchHandler;
outputSearch.oninput = searchHandler;

window.selectFile = function () {
  fileInput.click();
};

const fileSelectHandler = function (event) {

  let file;

  if ("dataTransfer" in event) {
    const item = event.dataTransfer?.items?.[0];
    if (item.kind !== "file") return;
    event.preventDefault();
    file = item.getAsFile();
  } else {
    file = event.target.files?.[0];
  }

  if (!file) return;
  selectedFile = file;

  fileSelectArea.innerHTML = `<h2>${file.name}</h2>`;

  let mimeType = file.type;
  if (mimeType === "image/x-icon") mimeType = "image/vnd.microsoft.icon";

  const fileExtension = file.name.split(".").pop();

  inputSearch.value = mimeType || fileExtension;
  searchHandler({ target: inputSearch });

  if (!mimeType) return;

  for (const button of Array.from(inputList.children)) {
    if (button.getAttribute("mime-type") === mimeType) {
      button.click();
      break;
    }
  }

};

fileInput.addEventListener("change", fileSelectHandler);
window.addEventListener("drop", fileSelectHandler);
window.addEventListener("dragover", (e) => e.preventDefault());

const popupBox = document.querySelector("#popup");
const popupBackground = document.querySelector("#popup-bg");

function showPopup (html) {
  popupBox.innerHTML = html;
  popupBox.style.display = "block";
  popupBackground.style.display = "block";
}
function hidePopup () {
  popupBox.style.display = "none";
  popupBackground.style.display = "none";
}

window.simpleMode = true;

const allOptions = [];
// Expose globally for debugging
window.allSupportedFormats = allOptions;

function buildOptionList () {

  allOptions.length = 0;
  inputList.innerHTML = "";
  outputList.innerHTML = "";

  for (const handler of handlers) {
    for (const format of handler.supportedFormats) {

      if (!format.mime) continue;

      allOptions.push({ format, handler });

      // In simple mode, display each input/output MIME type only once
      if (simpleMode) {
        if (
          (format.from && Array.from(inputList.children).some(c => c.getAttribute("mime-type") === format.mime)) ||
          (format.to && Array.from(outputList.children).some(c => c.getAttribute("mime-type") === format.mime))
        ) continue;
      }

      const newOption = document.createElement("button");
      newOption.setAttribute("format-index", allOptions.length - 1);
      newOption.setAttribute("mime-type", format.mime);

      if (simpleMode) {
        // Hide any handler-specific information in simple mode
        const cleanName = format.name
          .split("(").join(")").split(")")
          .filter((c, i) => i % 2 === 0)
          .filter(c => c != "")
          .join(" ");
        newOption.appendChild(document.createTextNode(cleanName + ` (${format.mime})`));
      } else {
        newOption.appendChild(document.createTextNode(format.name + ` (${format.mime}) ${handler.name}`));
      }

      const clickHandler = (event) => {
        const previous = event.target.parentElement.getElementsByClassName("selected")?.[0];
        if (previous) previous.className = "";
        event.target.className = "selected";
        const allSelected = document.getElementsByClassName("selected");
        if (allSelected.length === 2) {
          convertButton.className = "";
        } else {
          convertButton.className = "disabled";
        }
      };

      if (format.from) {
        const clone = newOption.cloneNode(true);
        clone.onclick = clickHandler;
        inputList.appendChild(clone);
      }
      if (format.to) {
        const clone = newOption.cloneNode(true);
        clone.onclick = clickHandler;
        outputList.appendChild(clone);
      }

    }
  }

  searchHandler({ target: inputSearch });
  searchHandler({ target: outputSearch });

  hidePopup();

}

const initPromises = [];
for (const handler of handlers) {
  initPromises.push(handler.init());
}
Promise.all(initPromises).then(buildOptionList);

modeToggleButton.addEventListener("click", () => {
  simpleMode = !simpleMode;
  if (simpleMode) {
    modeToggleButton.textContent = "Advanced mode";
    document.body.style.setProperty("--highlight-color", "#1C77FF");
  } else {
    modeToggleButton.textContent = "Simple mode";
    document.body.style.setProperty("--highlight-color", "#FF6F1C");
  }
  buildOptionList();
});

async function attemptConvertPath (file, path) {

  popupBox.innerHTML = `<h2>Finding conversion route...</h2>
    <p>Trying ${path.map(c => c.format.format).join(" -> ")}</p>`;

  for (let i = 0; i < path.length - 1; i ++) {
    try {
      file.bytes = await path[i + 1].handler.doConvert(file, path[i].format, path[i + 1].format);
      if (!file.bytes.length) throw "Output is empty.";
      file.name = file.name.split(".")[0] + "." + path[i + 1].format.extension;
    } catch (e) {
      console.log(path.map(c => c.format.format));
      console.error(path[i + 1].handler.name, `${path[i].format.format} -> ${path[i + 1].format.format}`, e);
      return null;
    }
  }

  return { file, path };

}

async function buildConvertPath (file, target, queue) {

  while (queue.length > 0) {
    const path = queue.shift();
    if (path.length > 5) continue;

    const previous = path[path.length - 1];

    // Get handlers that support *taking in* the previous node's format
    const validHandlers = handlers.filter(handler => (
      handler.supportedFormats.some(format => (
        format.mime === previous.format.mime &&
        format.from
      ))
    ));

    if (simpleMode) {
      // Try *all* supported handlers that output the target format
      const candidates = allOptions.filter(opt =>
        validHandlers.includes(opt.handler) &&
        opt.format.mime === target.format.mime && opt.format.to
      );
      for (const candidate of candidates) {
        const attempt = await attemptConvertPath(file, path.concat(candidate));
        if (attempt) return attempt;
      }
    } else {
      // Check if the target handler is supported by the previous node
      if (validHandlers.includes(target.handler)) {
        const attempt = await attemptConvertPath(file, path.concat(target));
        if (attempt) return attempt;
      }
    }

    // Look for untested mime types among valid handlers and add to queue
    for (const handler of validHandlers) {
      for (const format of handler.supportedFormats) {
        if (!format.to) continue;
        if (!format.mime) continue;
        if (path.some(c => c.format === format)) continue;
        queue.push(path.concat({ format, handler }));
      }
    }
  }

  return null;

}

window.convertSelection = async function () {

  const inputFile = selectedFile;

  if (!inputFile) {
    return alert("Select an input file.");
  }

  const inputButton = document.querySelector("#from-list .selected");
  if (!inputButton) return alert("Specify input file format.");

  const outputButton = document.querySelector("#to-list .selected");
  if (!outputButton) return alert("Specify output file format.");

  const inputOption = allOptions[Number(inputButton.getAttribute("format-index"))];
  const outputOption = allOptions[Number(outputButton.getAttribute("format-index"))];

  try {

    const inputBuffer = await inputFile.arrayBuffer();
    const inputBytes = new Uint8Array(inputBuffer);

    const inputFileData = { name: inputFile.name, bytes: inputBytes };

    showPopup("<h2>Finding conversion route...</h2>");

    const output = await buildConvertPath(inputFileData, outputOption, [[inputOption]]);
    if (!output) return alert("Failed to find conversion route.");

    const outputFormat = outputOption.format;

    const blob = new Blob([output.file.bytes], { type: outputFormat.mime });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = output.file.name;
    link.click();

    alert(
      `Converted ${inputOption.format.format} to ${outputOption.format.format}!\n` +
      `Path used: ${output.path.map(c => c.format.format).join(" -> ")}`
    );

  } catch (e) {

    alert("Unexpected error while routing:\n" + e);

  }

  hidePopup();

}
