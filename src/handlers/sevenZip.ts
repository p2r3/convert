// file: 7z.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import SevenZip from "7z-wasm";
import mime from "mime";
import normalizeMimeType from "src/normalizeMimeType.ts";

const defaultSevenZipOptions = {
  locateFile: () => "/convert/wasm/7zz.wasm"
}

class sevenZipHandler implements FormatHandler {

  public name: string = "sevenZip";
  public supportedFormats: FileFormat[] = [];
  public ready: boolean = false;

  public supportAnyInput: boolean = true;

  #tarCompressedFormats: string[] = [];

  async init () {
    this.supportedFormats = [];
    this.#tarCompressedFormats = [];

    const stdout: number[] = [];
    const sevenZip = await SevenZip({
      ...defaultSevenZipOptions,
      stdout: (c) => {
        stdout.push(c);
      },
    });

    sevenZip.callMain(["i"]);

    const text = new TextDecoder().decode(new Uint8Array(stdout));

    // no codecs for now
    const formatsText = text.match(/\n\n\nFormats:\n(.*?)\n\n/s);
    if (!formatsText) throw new Error("7zz output did not have any formats");
    const formatLines = formatsText[1].split("\n");

    // this will totally break in future 7z versions but its the only way
    for (const formatLine of formatLines) {
      // 7zz i gives more than 1 extension, but i dont think we will
      // need those as they are mostly aliases and thats renamehandler's job. 
      // also we cant faithfully parse more than 1 extension because there is no
      // way to know where extensions stop and weird signature stuff begins
      const [flags, name, extension, ...extra] = formatLine.trim().split(/ +/);

      if (name === "Hash") continue;
      const mimeType = normalizeMimeType(mime.getType(extension) || `application/${extension}`);
      let displayName = `${name} archive`;
      let format = extension;
    
      if (extra.includes("(.tar)")) { 
        // compressed formats will be only tar for now
        this.#tarCompressedFormats.push(name); 
        displayName = `${name} compressed tar archive`;
        format = `tar.${extension}`;
      } 

      this.supportedFormats.push({
        name: displayName,
        format,
        extension,
        mime: mimeType,
        from: true,
        to: flags.includes("C"),
        internal: name,
        category: Category.ARCHIVE,
        lossless: false, // archive metadata is too complicated
      });
    }

    // push zip and tar up the list 
    const priority = ["tar", "zip"];
    const prioritized = [];
    for (const format of priority) {
      prioritized.push(this.supportedFormats.find(f => f.internal === format)!);
    }
    this.supportedFormats = [
      ...prioritized,
      ...this.supportedFormats.filter(f => !priority.includes(f.internal))
    ];

    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    if (!this.supportedFormats.some(format => format.to && format.internal === outputFormat.internal)) {
      throw new Error(`sevenZipHandler cannot convert to ${outputFormat.mime}`);
    }

    // handle compressed tars
    if (this.#tarCompressedFormats.includes(inputFormat.internal) 
      || this.#tarCompressedFormats.includes(outputFormat.internal)) {

      if (outputFormat.internal === "tar") {
        for (const inputFile of inputFiles) {
          const sevenZip = await SevenZip(defaultSevenZipOptions);

          sevenZip.FS.writeFile(inputFile.name, inputFile.bytes);
          sevenZip.callMain(["x", inputFile.name]);

          const name = inputFile.name.replace(/\.[^.]+$/, "");
          const bytes = sevenZip.FS.readFile(name);
          outputFiles.push({ bytes, name });
        }
      } else if (inputFormat.internal === "tar") {
        for (const inputFile of inputFiles) {
          const sevenZip = await SevenZip(defaultSevenZipOptions);
          sevenZip.FS.writeFile(inputFile.name, inputFile.bytes);

          const name = inputFile.name + `.${outputFormat.extension}`;
          sevenZip.callMain(["a", name, inputFile.name]);

          const bytes = sevenZip.FS.readFile(name);
          outputFiles.push({ bytes, name });
        }
      } else {
        throw new Error(`sevenZipHandler cannot convert from ${inputFormat.mime} to ${outputFormat.mime}`);
      }
      
      return outputFiles;
    }

    if (this.supportedFormats.some(format => format.internal === inputFormat.internal)) {
      for (const inputFile of inputFiles) {
        const sevenZip = await SevenZip(defaultSevenZipOptions);

        sevenZip.FS.writeFile(inputFile.name, inputFile.bytes);
        sevenZip.callMain(["x", inputFile.name, `-odata`]);

        const name = inputFile.name.replace(/\.[^.]+$/, "") + `.${outputFormat.extension}`;
        sevenZip.FS.chdir("data"); // we need to preserve the structure of the input archive
        sevenZip.callMain(["a", "../" + name]);
        sevenZip.FS.chdir("..");

        const bytes = sevenZip.FS.readFile(name);
        outputFiles.push({ bytes, name });
      }
    } else {
      const sevenZip = await SevenZip(defaultSevenZipOptions);

      sevenZip.FS.mkdir("data");
      sevenZip.FS.chdir("data");
      for (const inputFile of inputFiles) {
        sevenZip.FS.writeFile(inputFile.name, inputFile.bytes);
      }

      const name = inputFiles.length === 1 ? 
        inputFiles[0].name + `.${outputFormat.extension}`
        : `archive.${outputFormat.extension}`;
      sevenZip.callMain(["a", "../" + name]);
      sevenZip.FS.chdir("..");

      const bytes = sevenZip.FS.readFile(name);
      outputFiles.push({ bytes, name });
    }

    return outputFiles;
  }

}

export default sevenZipHandler;
