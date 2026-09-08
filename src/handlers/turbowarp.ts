// file: turbowarp.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import { Packager, largeAssets, downloadProject } from "turbowarp-packager-browser";

// patching some assets
largeAssets.scaffolding.src = "/convert/js/turbowarp-scaffolding/scaffolding-full.js";
largeAssets["scaffolding-min"].src = "/convert/js/turbowarp-scaffolding/scaffolding-min.js";
largeAssets.addons.src = "/convert/js/turbowarp-scaffolding/addons.js";

class turbowarpHandler implements FormatHandler {

  public name: string = "turbowarp";
  public supportedFormats: FileFormat[] = [
    {
      name: "Scratch 3 Project",
      format: "sb3",
      extension: "sb3",
      mime: "application/x.scratch.sb3",
      from: true,
      to: true,
      internal: "sb3",
      category: Category.ARCHIVE,
      lossless: true, // all project data is in the html
    },
    CommonFormats.HTML.builder("html")
      .allowTo()
      .allowFrom()
      .markLossless()
  ];
  public ready: boolean = false;

  private unpackager?: any;

  async init () {
    this.unpackager = await import("./turbowarp/unpackager/unpackager.js");
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      if (inputFormat.internal === "sb3") {
        const project = await downloadProject(inputFile.bytes);

        const packager = new Packager();
        packager.project = project;
        packager.options.target = "html";

        const bytes = (await packager.package()).data;

        outputFiles.push({
          name: inputFile.name.replace(/\.sb3$/, ".html"),
          bytes
        });
      } else if (inputFormat.internal === "html") {
        const data = (await this.unpackager(inputFile.bytes)).data;
        const bytes = new Uint8Array(data);
        outputFiles.push({
          name: inputFile.name.replace(/\.html$/, ".sb3"),
          bytes
        });
      } else {
        throw new Error(`turbowarpHandler cannot convert from ${inputFormat.mime} to ${outputFormat.mime}`);
      }
    }
    return outputFiles;
  }

}

export default turbowarpHandler;
