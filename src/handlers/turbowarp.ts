// file: turbowarp.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
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
      to: false,
      internal: "sb3",
      category: "archive",
      lossless: false,
    },
    CommonFormats.HTML.builder("html")
      .allowTo()
  ];
  public ready: boolean = false;

  async init () {
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      const project = await downloadProject(inputFile.bytes);
      
      const packager = new Packager();
      packager.project = project;
      packager.options.target = "html";

      const bytes = (await packager.package()).data;

      outputFiles.push({ 
        name: inputFile.name.replace(/\.sb3$/, ".html"), 
        bytes 
      });
    }
    return outputFiles;
  }

}

export default turbowarpHandler;
