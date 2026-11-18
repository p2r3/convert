import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";
import JSZip from "jszip";
import * as pako from "pako";
import { isMOBI, MOBI } from "built/foliate-mobi/mobi.js";
import { DOMParser } from "linkedom/worker";
import { changeExt, ownedBytes } from "src/common/index.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
const escapeXml = (value: unknown) => String(value).replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

class azw3Handler implements FormatHandler {
  public readonly name = "azw3";
  public supportedFormats = [
    Formats.AZW3.builder("azw3").from(),
    Formats.MOBI.builder("mobi").from(),
    Formats.EPUB.builder("epub").to(),
  ];
  public ready = false;
  public abortable = true;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      await ctx?.checkpoint();
      const blob = new Blob([new Uint8Array(inputFile.bytes)]);
      const valid = await isMOBI(blob);
      if (!valid) throw new Error("Invalid MOBI/AZW3 file.");

      const book = await new MOBI({ unzlib: pako.inflate }).open(blob);
      const metadata = book.metadata;

      const zip = new JSZip();
      zip.file("mimetype", "application/epub+zip");

      const metaInf = zip.folder("META-INF")!;
      metaInf.file(
        "container.xml",
        `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`,
      );

      const oebps = zip.folder("OEBPS")!;
      const manifest: string[] = [];
      const spine: string[] = [];

      let itemIndex = 0;

      for (let i = 0; i < book.sections.length; i++) {
        const section = book.sections[i];
        const isLinear = section.linear !== "no";
        await ctx?.checkpoint();

        try {
          const doc: Document | undefined = await section.createDocument?.();
          if (!doc) continue;

          // Images handling
          for (const img of Array.from(doc.querySelectorAll("img"))) {
            const recindex = img.getAttribute("recindex");
            let b64 = null;
            let type = "image/jpeg";

            if (recindex != null) {
              try {
                const buf = await book.mobi.loadResource(Number(recindex) - 1);
                b64 = new Uint8Array(buf).toBase64();
              } catch (e) {
                console.warn(e);
              }
            } else {
              const src = img.getAttribute("src");
              // only KF8 (AZW3) books embed resources this way
              if (src && src.startsWith("kindle:embed:") && "loadResourceBlob" in book) {
                try {
                  const [b] = await book.loadResourceBlob(src);
                  if (b instanceof Blob) {
                    type = b.type;
                    b64 = (await b.bytes()).toBase64();
                  }
                } catch (e) {
                  console.warn(e);
                }
              }
            }

            if (b64) {
              img.setAttribute("src", `data:${type};base64,` + b64);
            }
          }

          // Serialize in XML mode so HTML void elements are valid EPUB XHTML.
          const xml = new DOMParser().parseFromString("", "text/xml");
          const root = xml.importNode(doc.documentElement, true);
          root.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
          const html =
            `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n` + root.toString();
          const filename = `part${itemIndex}.xhtml`;
          oebps.file(filename, html);

          manifest.push(
            `<item id="item${itemIndex}" href="${filename}" media-type="application/xhtml+xml" />`,
          );
          spine.push(`<itemref idref="item${itemIndex}" ${isLinear ? "" : 'linear="no" '}/>`);
          itemIndex++;
        } catch (e) {
          console.warn("Failed section", e);
        }
      }

      const uid = metadata?.identifier || Date.now();

      // Create content.opf
      const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>${escapeXml(metadata?.title || "Unknown Book")}</dc:title>
        <dc:language>${escapeXml(metadata?.language || "en")}</dc:language>
        <dc:identifier id="uid">${escapeXml(uid)}</dc:identifier>
        ${metadata?.author ? metadata.author.map((a: string) => `<dc:creator>${escapeXml(a)}</dc:creator>`).join("") : ""}
    </metadata>
    <manifest>
        ${manifest.join("\n        ")}
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    </manifest>
    <spine toc="ncx">
        ${spine.join("\n        ")}
    </spine>
</package>`;

      oebps.file("content.opf", opf);

      // Create dummy toc.ncx
      const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
        <meta name="dtb:uid" content="${escapeXml(uid)}"/>
        <meta name="dtb:depth" content="1"/>
        <meta name="dtb:totalPageCount" content="0"/>
        <meta name="dtb:maxPageNumber" content="0"/>
    </head>
    <docTitle>
        <text>${escapeXml(metadata?.title || "Unknown Book")}</text>
    </docTitle>
    <navMap>
        <navPoint id="navPoint-1" playOrder="1">
            <navLabel><text>Start</text></navLabel>
            <content src="part0.xhtml"/>
        </navPoint>
    </navMap>
</ncx>`;
      oebps.file("toc.ncx", ncx);

      const epubBlob = await zip.generateAsync({ type: "uint8array" });
      const outputName = changeExt(inputFile.name, "epub");
      outputFiles.push({
        name: outputName,
        bytes: ownedBytes(epubBlob),
      });
    }
    return outputFiles;
  }
}

export default azw3Handler;
