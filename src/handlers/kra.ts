import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import JSZip from "jszip";

class kraHandler implements FormatHandler {
  public name: string = "kra";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;
  buildDocumentInfoXml = (title: string, currentDate: string): string => `
<document-info xmlns="http://www.calligra.org/DTD/document-info">
<about>
<title>${title}</title>
<description/>
<subject/>
<abstract>
<![CDATA[ ]]>
</abstract>
<keyword/>
<initial-creator>Unknown</initial-creator>
<editing-cycles>1</editing-cycles>
<editing-time/>
<date>${currentDate}</date>
<creation-date>${currentDate}</creation-date>
<language/>
<license/>
</about>
<author>
<full-name/>
<creator-first-name/>
<creator-last-name/>
<initial/>
<author-title/>
<position/>
<company/>
</author>
</document-info>
`;

  async init() {
    this.supportedFormats = [
      CommonFormats.PNG.builder("png")
        .markLossless()
        .allowFrom(false)
        .allowTo(true),

      {
        name: "Krita Raster Archive (KRA)",
        format: "kra",
        extension: "kra",
        mime: "application/x-krita",
        from: true,
        to: false,
        internal: "kra",
        category: ["archive"],
        lossless: true,
      },
    ];
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    if (inputFormat.format == "kra" && outputFormat.format == "png") {
      for (const inputFile of inputFiles) {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(inputFile.bytes);
        let imageFile;

        try {
          imageFile = zipContent.file("mergedimage.png");

          if (!imageFile) {
            throw new Error();
          }
        } catch {
          imageFile = zipContent.file("preview.png");

          if (!imageFile) {
            throw new Error("Could not find image in KRA file");
          }
        }
        const imageData = await imageFile.async("uint8array");
        outputFiles.push({
          name: inputFile.name.replace(/\.kra$/, ".png"),
          bytes: imageData,
        });
      }
    }
    if (inputFormat.format == "png" && outputFormat.format == "kra") {
      for (const inputFile of inputFiles) {
        // steps for conversion
        // 1. Create a new zip file [done]
        // 2. Add the PNG file to the zip with the name "mergedimage.png" [done]
        // 3. scale down the png to 256x256 and add it to the zip with the name "preview.png"
        // 4. add a mimetype file with the content "application/x-krita"
        // 5. maindoc.xml
        // 6. documentinfo.xml [done]
        // 7. add the zip file to the outputFiles array with the name of the input file but with the .kra extension

        const zip = new JSZip();
        zip.file("mergedimage.png", inputFile.bytes);
        zip.file("mimetype", "application/x-krita");

        const currentDate = new Date().toISOString();
        const documentInfoXml = this.buildDocumentInfoXml(
          inputFile.name,
          currentDate,
        );
        zip.file("documentinfo.xml", documentInfoXml);
      }
    }
    return outputFiles;
  }
}

export default kraHandler;
