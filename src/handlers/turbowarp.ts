import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import { Packager, largeAssets, downloadProject } from "turbowarp-packager";
import unpackager from "turbowarp-unpackager";
import scaffoldingUrl from "built/turbowarp-packager/scaffolding/scaffolding-full.js?url";
import scaffoldingMinUrl from "built/turbowarp-packager/scaffolding/scaffolding-min.js?url";
import addonsUrl from "built/turbowarp-packager/scaffolding/addons.js?url";
import { changeExt, ownedBytes } from "src/common/index.ts";

// patching some assets
largeAssets.scaffolding.src = scaffoldingUrl;
largeAssets["scaffolding-min"].src = scaffoldingMinUrl;
largeAssets.addons.src = addonsUrl;

class turbowarpHandler implements FormatHandler {
  public readonly name = "turbowarp";
  public supportedFormats = [
    Formats.SB3.builder("sb3").lossless().fromTo(), // all project data is in the html
    Formats.HTML.builder("html").lossless().fromTo(),
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      if (inputFormat.internal === "sb3") {
        const project = await downloadProject(inputFile.bytes);

        const packager = new Packager();
        packager.project = project;
        packager.options.target = "html";

        const bytes = ownedBytes((await packager.package()).data);

        outputFiles.push({
          name: changeExt(inputFile.name, "html"),
          bytes,
        });
      } else if (inputFormat.internal === "html") {
        const data = (await unpackager(inputFile.bytes)).data;
        const bytes = new Uint8Array(data);
        outputFiles.push({
          name: changeExt(inputFile.name, "sb3"),
          bytes,
        });
      } else {
        throw new Error(
          `turbowarpHandler cannot convert from ${inputFormat.mime} to ${outputFormat.mime}`,
        );
      }
    }
    return outputFiles;
  }
}

export default turbowarpHandler;
