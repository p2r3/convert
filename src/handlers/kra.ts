import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import JSZip from "jszip";

class kraHandler implements FormatHandler {
  public name: string = "kra";
  public supportedFormats?: FileFormat[];
  public ready: boolean = false;
  buildmaindocXml = (
    width: number,
    height: number,
    xres: number,
    yres: number,
    description: string,
    colorspacename: string,
    backgroundColor?: string,
  ): string => {
    const layers = [
      { name: "Paint Layer 1", uuid: crypto.randomUUID() },
      { name: "Background", uuid: crypto.randomUUID() },
    ];
    const maindocXml = `<DOC xmlns="http://www.calligra.org/DTD/krita" editor="Krita" kritaVersion="6.0.1" syntaxVersion="2.0">
<IMAGE colorspacename="${colorspacename}" description="${description}" height="${height}" mime="application/x-kra" name="Test" profile="sRGB-elle-V2-srgbtrc.icc" width="${width}" x-res="${xres}" y-res="${yres}">
<layers>
<layer channelflags="" channellockflags="" collapsed="0" colorlabel="0" colorspacename="RGBA" compositeop="normal" filename="layer2" intimeline="1" locked="0" name="${layers[0].name}" nodetype="paintlayer" onionskin="0" opacity="255" selected="true" uuid="{${layers[0].uuid}}" visible="1" x="0" y="0"/>
<layer channelflags="" channellockflags="" collapsed="0" colorlabel="0" colorspacename="RGBA" compositeop="normal" filename="layer3" intimeline="1" locked="1" name="${layers[1].name}" nodetype="paintlayer" onionskin="0" opacity="255" uuid="{${layers[1].uuid}}" visible="1" x="0" y="0"/>
</layers>
<ProjectionBackgroundColor ColorData="AAAAAA=="/>
<GlobalAssistantsColor SimpleColorData="176,176,176,255"/>
<MirrorAxis>
<mirrorHorizontal type="value" value="0"/>
<mirrorVertical type="value" value="0"/>
<lockHorizontal type="value" value="0"/>
<lockVertical type="value" value="0"/>
<hideHorizontalDecoration type="value" value="0"/>
<hideVerticalDecoration type="value" value="0"/>
<handleSize type="value" value="32"/>
<horizontalHandlePosition type="value" value="64"/>
<verticalHandlePosition type="value" value="64"/>
<axisPosition type="pointf" x="256" y="256"/>
</MirrorAxis>
<ColorHistory>
<RGB b="0.505882382392883" g="0.0588235296308994" r="0" space="sRGB-elle-V2-srgbtrc.icc"/>
<RGB b="0" g="0.505882382392883" r="0.243137255311012" space="sRGB-elle-V2-srgbtrc.icc"/>
<RGB b="0" g="0" r="0.505882382392883" space="sRGB-elle-V2-srgbtrc.icc"/>
<RGB b="0" g="0" r="0" space="sRGB"/>
</ColorHistory>
<Palettes/>
<resources/>
<animation>
<framerate type="value" value="24"/>
<range from="0" to="100" type="timerange"/>
<currentTime type="value" value="0"/>
</animation>
</IMAGE>
</DOC>`;
    return maindocXml;
  };

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
        // 7. layer data in imagename/layers/layerdatafile
        // 8. add the zip file to the outputFiles array with the name of the input file but with the .kra extension

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
