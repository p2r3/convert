import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats, { Category, SpecialFormats } from "src/Formats.ts";
import SevenZip from "built/7z/7zz.js";
import sevenZipWasmUrl from "built/7z/7zz.wasm?url";
import mime from "mime";
import normalizeMimeType from "src/normalizeMimeType.ts";
import type { ConvertContext } from "src/ui/ProgressStore.js";
import { changeExt, stripExt } from "src/common/index.ts";
import { extractedParent, filePath, joinPath, splitPath } from "src/common/path.ts";

const defaultSevenZipOptions = {
  locateFile: () => sevenZipWasmUrl,
};

class sevenZipHandler implements FormatHandler {
  public readonly name = "sevenZip";
  public supportedFormats: FileFormat[] = [];
  public ready = false;

  #tarCompressedFormats: string[] = [];

  async init() {
    this.supportedFormats = [];
    this.#tarCompressedFormats = [];

    let text = "";
    const sevenZip = await SevenZip({
      ...defaultSevenZipOptions,
      print(str: string) {
        text += str + "\n";
      },
    });

    sevenZip.callMain(["i"]);

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
      let mimeType = normalizeMimeType(mime.getType(extension) || `application/${extension}`);
      if (extension === "exe") mimeType = Formats.EXE.mime;
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
      prioritized.push(this.supportedFormats.find((f) => f.internal === format)!);
    }
    this.supportedFormats = [
      ...prioritized,
      ...this.supportedFormats.filter((f) => !priority.includes(f.internal)),
    ];

    // Packs anything; extracting yields whatever the archive contains
    this.supportedFormats.push(SpecialFormats.ANY.builder("ANY").lossless().fromTo());

    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    if (inputFormat.internal === "brarchive") {
      throw new Error(`sevenZipHandler cannot convert from ${inputFormat.mime}`);
    }

    const createSevenZip = async () => {
      return await SevenZip({
        ...defaultSevenZipOptions,
        print(str: string) {
          ctx?.log(str, "debug");
        },
      });
    };

    if (outputFormat.mime === SpecialFormats.ANY.mime) {
      // Extract the archive and return its contents.
      // The converter detects what the files actually are and continues from there.
      let i = 0;
      for (const inputFile of inputFiles) {
        ctx?.progress(`Extracting ${inputFile.name}...`, i / inputFiles.length);
        ctx?.log(`Extracting ${inputFile.name}...`);
        const sevenZip = await createSevenZip();

        sevenZip.FS.writeFile(inputFile.name, inputFile.bytes);
        sevenZip.callMain(["x", inputFile.name, "-odata"]);

        const parent = extractedParent(inputFile, inputFiles.length > 1);
        const walk = (dir: string, rel: string) => {
          const entries = (sevenZip.FS.readdir(dir) as string[])
            .filter((entry) => entry !== "." && entry !== "..")
            .toSorted();
          for (const entry of entries) {
            const path = `${dir}/${entry}`;
            const relPath = joinPath(rel, entry);
            if (sevenZip.FS.isDir(sevenZip.FS.stat(path, false).mode)) {
              walk(path, relPath);
              continue;
            }
            const bytes = sevenZip.FS.readFile(path);
            if (!bytes.length) continue; // empty files would fail the whole step
            outputFiles.push({ ...splitPath(relPath, parent), bytes });
          }
        };
        walk("data", "");
        i++;
      }

      ctx?.progress("Complete!", 1);
      ctx?.log(`SevenZip extracted ${outputFiles.length} files.`);
      return outputFiles;
    }

    if (
      !this.supportedFormats.some(
        (format) => format.to && format.internal === outputFormat.internal,
      )
    ) {
      throw new TypeError(`sevenZipHandler cannot convert to ${outputFormat.mime}`);
    }

    ctx?.log(`Initialising SevenZip for ${inputFormat.name} -> ${outputFormat.name}...`);

    // handle compressed tars
    if (
      this.#tarCompressedFormats.includes(inputFormat.internal) ||
      this.#tarCompressedFormats.includes(outputFormat.internal)
    ) {
      if (outputFormat.internal === "tar") {
        let i = 0;
        for (const inputFile of inputFiles) {
          ctx?.progress(`Extracting ${inputFile.name}...`, i / inputFiles.length);
          ctx?.log(`Extracting ${inputFile.name}...`);
          const sevenZip = await createSevenZip();

          sevenZip.FS.writeFile(inputFile.name, inputFile.bytes);
          sevenZip.callMain(["x", inputFile.name]);

          const name = stripExt(inputFile.name);
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
        throw new TypeError(
          `sevenZipHandler cannot convert from ${inputFormat.mime} to ${outputFormat.mime}`,
        );
      }
    } else if (
      inputFormat.mime !== SpecialFormats.ANY.mime &&
      this.supportedFormats.some((format) => format.internal === inputFormat.internal)
    ) {
      // Archive-to-archive conversion
      let i = 0;
      for (const inputFile of inputFiles) {
        ctx?.progress(`Processing archive ${inputFile.name}...`, i / inputFiles.length);
        ctx?.log(`Processing archive ${inputFile.name}...`);
        const sevenZip = await createSevenZip();

        sevenZip.FS.writeFile(inputFile.name, inputFile.bytes);
        ctx?.log(`Extracting ${inputFile.name} to temporary directory...`, "debug");
        sevenZip.callMain(["x", inputFile.name, `-odata`]);

        const name = changeExt(inputFile.name, outputFormat.extension);
        sevenZip.FS.chdir("data"); // we need to preserve the structure of the input archive

        ctx?.log(`Re-archiving contents as ${outputFormat.internal}...`, "debug");
        sevenZip.callMain(["a", "../" + name]);
        sevenZip.FS.chdir("..");

        const bytes = sevenZip.FS.readFile(name);

        outputFiles.push({ bytes, name });
        i++;
      }
    } else {
      // anything-to-archive conversion
      ctx?.progress(`Creating ${outputFormat.name}...`, 0.5);
      ctx?.log(`Creating ${outputFormat.name} from ${inputFiles.length} files...`);
      const sevenZip = await createSevenZip();

      // Prevent just zipping another archive file and calling that conversion.
      if (
        inputFormat.category &&
        outputFormat.category &&
        (inputFormat.category === Category.ARCHIVE ||
          inputFormat.category.includes(Category.ARCHIVE)) &&
        (outputFormat.category === Category.ARCHIVE ||
          outputFormat.category.includes(Category.ARCHIVE))
      ) {
        throw new Error(
          `sevenZipHandler cannot convert from ${inputFormat.mime} to ${outputFormat.mime}`,
        );
      }

      sevenZip.FS.mkdir("data");
      sevenZip.FS.chdir("data");
      for (const file of inputFiles) {
        const { name, path } = splitPath(filePath(file));
        if (path) sevenZip.FS.mkdirTree(path, 0o777);
        sevenZip.FS.writeFile(joinPath(path, name), file.bytes);
      }

      const baseName = stripExt(inputFiles[0].name);
      const name =
        inputFiles.length === 1
          ? baseName + `.${outputFormat.extension}`
          : `archive.${outputFormat.extension}`;

      ctx?.log(`Compiling archive ${name}...`);
      sevenZip.callMain(["a", "../" + name]);
      sevenZip.FS.chdir("..");

      const bytes = sevenZip.FS.readFile(name);

      outputFiles.push({ bytes, name });
    }

    ctx?.progress("Complete!", 1);
    ctx?.log(`SevenZip successfully processed ${inputFiles.length} files.`);
    return outputFiles;
  }
}

export default sevenZipHandler;
