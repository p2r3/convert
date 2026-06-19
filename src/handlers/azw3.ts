import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import JSZip from "jszip";
import pako from "pako";
import { isMOBI, MOBI } from "./azw3/mobi.js";

class azw3Handler implements FormatHandler {

    public name: string = "azw3";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    async init () {
        this.supportedFormats = [
            CommonFormats.AZW3.supported("azw3", true, false),
            CommonFormats.MOBI.supported("mobi", true, false),
            CommonFormats.EPUB.supported("epub", false, true)
        ];
        this.ready = true;
    }

    async doConvert (
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];
        for (const inputFile of inputFiles) {
            const blob = new Blob([new Uint8Array(inputFile.bytes)]);
            const valid = await isMOBI(blob);
            if (!valid) throw new Error("Invalid MOBI/AZW3 file.");

            const book = await new MOBI({ unzlib: pako.inflate }).open(blob);
            const metadata = book.metadata;

            const zip = new JSZip();
            zip.file("mimetype", "application/epub+zip");
            
            const metaInf = zip.folder("META-INF")!;
            metaInf.file("container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`);

            const oebps = zip.folder("OEBPS")!;
            const manifest: string[] = [];
            const spine: string[] = [];
            
            const serializer = new XMLSerializer();

            let itemIndex = 0;

            for (let i = 0; i < book.sections.length; i++) {
                const section = book.sections[i];
                const isLinear = section.linear !== 'no';

                try {
                    const doc = await section.createDocument?.() as Document;
                    if (!doc) continue;

                    // Images handling
                    for (const img of Array.from(doc.querySelectorAll('img'))) {
                        const recindex = img.getAttribute('recindex');
                        let b64 = null;
                        let type = "image/jpeg";
                        
                        if (recindex != null) {
                            try {
                                const buf = await book.mobi.loadResource(Number(recindex) - 1);
                                const uint8 = new Uint8Array(buf as ArrayBuffer);
                                let binary = '';
                                for (let j = 0; j < uint8.byteLength; j++) {
                                    binary += String.fromCharCode(uint8[j]);
                                }
                                b64 = btoa(binary);
                            } catch (e) {
                                console.warn(e);
                            }
                        } else {
                            const src = img.getAttribute('src');
                            if (src && src.startsWith('kindle:embed:')) {
                                try {
                                    const [b, inline] = await (book as any).loadResourceBlob(src);
                                    if (b) {
                                        type = b.type;
                                        const arrayBuffer = await b.arrayBuffer();
                                        const uint8 = new Uint8Array(arrayBuffer);
                                        let binary = '';
                                        for (let j = 0; j < uint8.byteLength; j++) {
                                            binary += String.fromCharCode(uint8[j]);
                                        }
                                        b64 = btoa(binary);
                                    }
                                } catch (e) {
                                    console.warn(e);
                                }
                            }
                        }

                        if (b64) {
                            img.src = `data:${type};base64,` + b64;
                        }
                    }

                    const html = `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n` + serializer.serializeToString(doc);
                    const filename = `part${itemIndex}.xhtml`;
                    oebps.file(filename, html);
                    
                    manifest.push(`<item id="item${itemIndex}" href="${filename}" media-type="application/xhtml+xml" />`);
                    spine.push(`<itemref idref="item${itemIndex}" ${isLinear ? '' : 'linear="no" '}/>`);
                    itemIndex++;

                } catch (e) {
                    console.warn("Failed section", e);
                }
            }

            // Create content.opf
            const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>${metadata?.title || "Unknown Book"}</dc:title>
        <dc:language>${metadata?.language || "en"}</dc:language>
        <dc:identifier id="uid">${metadata?.identifier || Date.now()}</dc:identifier>
        ${metadata?.author ? metadata.author.map((a: string) => `<dc:creator>${a}</dc:creator>`).join('') : ''}
    </metadata>
    <manifest>
        ${manifest.join('\\n        ')}
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    </manifest>
    <spine toc="ncx">
        ${spine.join('\\n        ')}
    </spine>
</package>`;

            oebps.file("content.opf", opf);

            // Create dummy toc.ncx
            const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
        <meta name="dtb:uid" content="${metadata?.identifier || Date.now()}"/>
        <meta name="dtb:depth" content="1"/>
        <meta name="dtb:totalPageCount" content="0"/>
        <meta name="dtb:maxPageNumber" content="0"/>
    </head>
    <docTitle>
        <text>${metadata?.title || "Unknown Book"}</text>
    </docTitle>
    <navMap>
        <navPoint id="navPoint-1" playOrder="1">
            <navLabel><text>Start</text></navLabel>
            <content src="part0.html"/>
        </navPoint>
    </navMap>
</ncx>`;
            oebps.file("toc.ncx", ncx);

            const epubBlob = await zip.generateAsync({ type: "uint8array" });
            const outputName = inputFile.name.split(".").slice(0, -1).join(".") + ".epub";
            outputFiles.push({
                name: outputName,
                bytes: epubBlob
            });
        }
        return outputFiles;
    }
}

export default azw3Handler;
