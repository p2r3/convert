// file: 7z.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import SevenZip from "7z-wasm";
import mime from "mime";
import normalizeMimeType from "src/normalizeMimeType.ts";
import type { ConvertContext } from "src/ui/ProgressStore.js";

const defaultSevenZipOptions = {
  locateFile: () => "/convert/wasm/7zz.wasm"
}

function padNumberString(num: number, digits: number): string {
  let str = String(num);

  while (str.length < digits) {
    str = "0"+str;
  }

  return str;
}

class sevenZipHandler implements FormatHandler {

  public name: string = "sevenZip";
  public supportedFormats: FileFormat[] = [];
  public ready: boolean = false;

  public supportAnyInput: boolean = true;

  #tarCompressedFormats: string[] = [];

  async init () {
    let zipTo = false;
    let rarTo = false;
    let tarTo = false;
    let szTo = false;

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

      // Comic flags
      if (extension === "zip") {
        zipTo = flags.includes("C");
      }
      else if (extension === "rar") {
        rarTo = flags.includes("C");
      }
      else if (extension === "tar") {
        tarTo = flags.includes("C");
      }
      else if (extension === "7z") {
        szTo = flags.includes("C");
      }

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

    // Comic book support
    this.supportedFormats.push({
      name: "Comic Book Archive (ZIP)",
      format: "cbz",
      extension: "cbz",
      mime: "application/vnd.comicbook+zip",
      from: true,
      to: zipTo,
      internal: "cbz",
      category: Category.ARCHIVE,
      lossless: false,
    });
    this.supportedFormats.push({
      name: "Comic Book Archive (TAR)",
      format: "cbt",
      extension: "cbt",
      mime: "application/vnd.comicbook+tar",
      from: true,
      to: tarTo,
      internal: "cbt",
      category: Category.ARCHIVE,
      lossless: false,
    });
    this.supportedFormats.push({
      name: "Comic Book Archive (RAR)",
      format: "cbr",
      extension: "cbr",
      mime: "application/vnd.comicbook+rar",
      from: true,
      to: rarTo,
      internal: "cbr",
      category: Category.ARCHIVE,
      lossless: false,
    });
    this.supportedFormats.push({
      name: "Comic Book Archive (7Z)",
      format: "cb7",
      extension: "cb7",
      mime: "application/vnd.comicbook+7z",
      from: true,
      to: szTo,
      internal: "cb7",
      category: Category.ARCHIVE,
      lossless: false,
    });

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
    outputFormat: FileFormat,
    args?: string[],
    ctx?: ConvertContext
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    if (inputFormat.internal === "brarchive") {
        throw new Error(`sevenZipHandler cannot convert from ${inputFormat.mime}`);
    }

    if (!this.supportedFormats.some(format => format.to && format.internal === outputFormat.internal)) {
      throw new TypeError(`sevenZipHandler cannot convert to ${outputFormat.mime}`);
    }

    let logBuffer = "";
    const createSevenZip = async () => {
      return await SevenZip({
        ...defaultSevenZipOptions,
        stdout: (c) => {
          const char = String.fromCharCode(c);
          if (char === "\n") {
            ctx?.log(logBuffer, "debug");
            logBuffer = "";
          } else {
            logBuffer += char;
          }
        },
      });
    };

    ctx?.log(`Initialising SevenZip for ${inputFormat.name} -> ${outputFormat.name}...`);

    // handle compressed tars
    if (this.#tarCompressedFormats.includes(inputFormat.internal)
      || this.#tarCompressedFormats.includes(outputFormat.internal)) {

      if (outputFormat.internal === "tar") {
        let i = 0;
        for (const inputFile of inputFiles) {
          ctx?.progress(`Extracting ${inputFile.name}...`, i / inputFiles.length);
          ctx?.log(`Extracting ${inputFile.name}...`);
          const sevenZip = await createSevenZip();

          sevenZip.FS.writeFile(inputFile.name, inputFile.bytes);
          sevenZip.callMain(["x", inputFile.name]);

          const name = inputFile.name.replace(/\.[^.]+$/, "");
          const bytes = sevenZip.FS.readFile(name);
          outputFiles.push({ bytes, name });
          i++;
        }
      } else if (inputFormat.internal === "tar") {
        let i = 0;
        for (const inputFile of inputFiles) {
          ctx?.progress(`Compressing ${inputFile.name}...`, i / inputFiles.length);
          ctx?.log(`Compressing ${inputFile.name}...`);
          const sevenZip = await createSevenZip();
          sevenZip.FS.writeFile(inputFile.name, inputFile.bytes);

          const name = inputFile.name + `.${outputFormat.extension}`;
          sevenZip.callMain(["a", name, inputFile.name]);

          const bytes = sevenZip.FS.readFile(name);
          outputFiles.push({ bytes, name });
          i++;
        }
      } else {
        throw new TypeError(`sevenZipHandler cannot convert from ${inputFormat.mime} to ${outputFormat.mime}`);
      }
    } else if (this.supportedFormats.some(format => format.internal === inputFormat.internal)) { // Archive-to-archive conversion
      let i = 0;
      for (const inputFile of inputFiles) {
        // This converter cannot validate that a non-comic archive is a valid comic archive, so we disallow those conversions.
        if (!inputFormat.mime.includes("comicbook") && outputFormat.mime.includes("comicbook")) {
          throw new Error("Cannot convert from non-comic archive to comic archive directly.");
        }

        ctx?.progress(`Processing archive ${inputFile.name}...`, i / inputFiles.length);
        ctx?.log(`Processing archive ${inputFile.name}...`);
        const sevenZip = await createSevenZip();

        sevenZip.FS.writeFile(inputFile.name, inputFile.bytes);
        ctx?.log(`Extracting ${inputFile.name} to temporary directory...`, "debug");
        sevenZip.callMain(["x", inputFile.name, `-odata`]);

        let name = inputFile.name.replace(/\.[^.]+$/, "") + `.${outputFormat.extension}`;
        sevenZip.FS.chdir("data"); // we need to preserve the structure of the input archive

        // Correct the file extension so the converter recognizes it.
        if (outputFormat.mime.includes("comicbook")) {
          name = name.replace(/\.cbz$/,".zip").replace(/\.cbt$/,".tar").replace(/\.cbr$/,".rar").replace(/\.cb7$/,".7z");
        }

        ctx?.log(`Re-archiving contents as ${outputFormat.internal}...`, "debug");
        sevenZip.callMain(["a", "../" + name]);
        sevenZip.FS.chdir("..");

        const bytes = sevenZip.FS.readFile(name);

        // Change it back
        if (outputFormat.mime.includes("comicbook")) {
          name = name.replace(/\.zip$/,".cbz").replace(/\.tar$/,".cbt").replace(/\.rar$/,".cbr").replace(/\.7z$/,".cb7");
        }

        outputFiles.push({ bytes, name });
        i++;
      }
    } else { // anything-to-archive conversion
      ctx?.progress(`Creating ${outputFormat.name}...`, 0.5);
      ctx?.log(`Creating ${outputFormat.name} from ${inputFiles.length} files...`);
      const sevenZip = await createSevenZip();

      // Prevent just zipping another archive file and calling that conversion.
      if (inputFormat.category && outputFormat.category && (inputFormat.category === Category.ARCHIVE || inputFormat.category.includes(Category.ARCHIVE)) && (outputFormat.category === Category.ARCHIVE || outputFormat.category.includes(Category.ARCHIVE))) {
        throw new Error(`sevenZipHandler cannot convert from ${inputFormat.mime} to ${outputFormat.mime}`);
      }

      const image_list = ["png","jpg","jpeg","webp","bmp","tiff","gif"];
      if (outputFormat.mime.includes("comicbook")) {
        // Single-gif catching
        if (inputFormat.internal === "gif" && inputFiles.length === 1) {
          throw new Error("User probably intends for an archive of video/gif frames; abort.");
        }
        // PDF catching
        else if (!image_list.includes(inputFormat.extension)) {
          throw new Error("Invalid input for a CBX: "+inputFormat.internal);
        }
      }

      sevenZip.FS.mkdir("data");
      sevenZip.FS.chdir("data");
      const necessaryDigits = String(inputFiles.length-1).length;
      for (let i = 0; i < inputFiles.length; i++) {
        ctx?.log(`Adding ${inputFiles[i].name} to archive...`, "debug");
        if (outputFormat.mime.includes("comicbook")) {
          sevenZip.FS.writeFile(padNumberString(i,necessaryDigits)+"."+inputFormat.extension, inputFiles[i].bytes);
        }
        else {
          sevenZip.FS.writeFile(inputFiles[i].name, inputFiles[i].bytes);
        }
      }

      const baseName = inputFiles[0].name.replace("_0."+inputFormat.extension,"."+inputFormat.extension).split(".").slice(0, -1).join(".");
      let name = inputFiles.length === 1 || outputFormat.mime.includes("comicbook") ?
        baseName + `.${outputFormat.extension}`
        : `archive.${outputFormat.extension}`;

      // Correct the file extension so the converter recognizes it.
      if (outputFormat.mime.includes("comicbook")) {
        name = name.replace(/\.cbz$/,".zip").replace(/\.cbt$/,".tar").replace(/\.cbr$/,".rar").replace(/\.cb7$/,".7z");
      }

      ctx?.log(`Compiling archive ${name}...`);
      sevenZip.callMain(["a", "../" + name]);
      sevenZip.FS.chdir("..");

      const bytes = sevenZip.FS.readFile(name);

      // Change it back
      if (outputFormat.mime.includes("comicbook")) {
        name = name.replace(/\.zip$/,".cbz").replace(/\.tar$/,".cbt").replace(/\.rar$/,".cbr").replace(/\.7z$/,".cb7");
      }

      outputFiles.push({ bytes, name });
    }

    ctx?.progress("Complete!", 1);
    ctx?.log(`SevenZip successfully processed ${inputFiles.length} files.`);
    return outputFiles;
  }

}

export default sevenZipHandler;
