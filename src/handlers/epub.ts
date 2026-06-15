import CommonFormats from "../CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { ConvertContext } from "../ui/ProgressStore.js";
import ePub from "epubjs";

function blobUrlRegex() {
  return /url\(\s*(['"]?)(blob:[^'")\s]+)\1\s*\)/gu;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function blobUrlToDataUrl(url: string, cache: Map<string, Promise<string>>): Promise<string> {
  const existing = cache.get(url);
  if (existing) return await existing;

  const task = (async () => {
    const response = await fetch(url);
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  })();
  cache.set(url, task);
  return await task;
}

async function replaceBlobUrlsInCss(
  cssText: string,
  cache: Map<string, Promise<string>>,
): Promise<string> {
  const urls = Array.from(cssText.matchAll(blobUrlRegex()))
    .map((match) => match[2]);
  const uniqueUrls = Array.from(new Set(urls));

  if (uniqueUrls.length === 0) return cssText;

  const dataUrlMap = new Map<string, string>();
  await Promise.all(
    uniqueUrls.map(async (url) => {
      dataUrlMap.set(url, await blobUrlToDataUrl(url, cache));
    }),
  );

  return cssText.replace(blobUrlRegex(), (match, quote, blobUrl) => {
    const dataUrl = dataUrlMap.get(blobUrl);
    return dataUrl ? `url(${quote}${dataUrl}${quote})` : match;
  });
}

async function inlineBlobBackedAttributes(
  doc: Document,
  cache: Map<string, Promise<string>>,
) {
  const blobElements = Array.from(
    doc.querySelectorAll('[src^="blob:"], [href^="blob:"], [poster^="blob:"]'),
  );

  await Promise.all(
    blobElements.map(async (element) => {
      for (const attr of ["src", "href", "poster"]) {
        const value = element.getAttribute(attr);
        if (value?.startsWith("blob:")) {
          element.setAttribute(attr, await blobUrlToDataUrl(value, cache));
        }
      }
    }),
  );
}

class EpubHandler implements FormatHandler {
  public name: string = "epub";
  public ready: boolean = false;

  public supportedFormats: FileFormat[] = [
    CommonFormats.EPUB.supported("epub", true, false),
    CommonFormats.HTML.supported("html", false, true),
  ];

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    _inputFormat: FileFormat,
    outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    if (!this.ready) throw new Error("Handler not initialized.");

    const outputFiles: FileData[] = [];
    const blobUrlCache = new Map<string, Promise<string>>();

    for (const file of inputFiles) {
      const baseName = file.name.replace(/\.[^.]+$/u, "");

      if (outputFormat.internal === "html") {
        ctx?.log("Creating rendering iframe...");
        const printIframe = document.createElement("iframe");
        printIframe.style.width = "100%";
        printIframe.style.height = "600px";
        printIframe.style.display = "none";
        document.body.appendChild(printIframe);

        const printDoc = printIframe.contentDocument || printIframe.contentWindow?.document;
        if (!printDoc) throw new Error("Could not create print iframe");

        const epubContainer = document.createElement("div");
        epubContainer.style.position = "absolute";
        epubContainer.style.top = "-9999px";
        epubContainer.style.visibility = "hidden";
        document.body.appendChild(epubContainer);

        const arrayBuffer = file.bytes.buffer.slice(
          file.bytes.byteOffset,
          file.bytes.byteOffset + file.bytes.byteLength
        );

        ctx?.log(`Parsing EPUB buffer (${file.bytes.byteLength} bytes)...`);
        ctx?.progress("Parsing EPUB...", 0);
        const currentBook = ePub(arrayBuffer as ArrayBuffer);
        await currentBook.ready;
        ctx?.log("EPUB ready.");

        printDoc.open();
        printDoc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>${(currentBook as any).package?.metadata?.title || baseName}</title>
              <style>
                body { 
                  font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, serif; 
                  max-width: 800px;
                  margin: 2rem auto;
                  padding: 0 2rem;
                  line-height: 1.6;
                  color: #1a1a1a;
                }
                img { 
                  max-width: 100%; 
                  height: auto !important;
                  break-inside: avoid;
                  page-break-inside: avoid;
                }
                figure, table, pre, blockquote {
                  break-inside: avoid;
                  page-break-inside: avoid;
                }
                .epub-section {
                  break-before: page;
                  page-break-before: always;
                }
                .epub-section:first-child {
                  break-before: auto;
                  page-break-before: auto;
                }
              </style>
            </head>
            <body>
              <div id="print-content"></div>
            </body>
          </html>
        `);
        printDoc.close();

        const printContent = printDoc.getElementById('print-content')!;
        const head = printDoc.head;
        const injectedStyles = new Set<string>();

        const spineItems = (currentBook.spine as any).spineItems || [];
        const totalSpineItems = spineItems.length;
        
        if (totalSpineItems === 0) {
          throw new Error("No spine items found in the EPUB.");
        }

        ctx?.log(`Found ${totalSpineItems} spine chapters. Rendering...`);

        const CONCURRENCY = 8;
        const results: Array<{ headStyles: string[], bodyHTML: string } | null> = new Array(totalSpineItems).fill(null);
        let currentIndex = 0;
        let completedChapters = 0;

        const processWorker = async () => {
          const container = document.createElement("div");
          container.style.position = "absolute";
          container.style.visibility = "hidden";
          container.style.width = "800px";
          container.style.height = "600px";
          epubContainer.appendChild(container);

          const rendition = currentBook.renderTo(container, {
            width: 800,
            height: 600,
            manager: "continuous",
            flow: "scrolled",
          });

          while (true) {
            ctx?.throwIfAborted();
            const index = currentIndex++;
            if (index >= totalSpineItems) break;

            const chapterProgress = completedChapters / totalSpineItems;
            ctx?.progress(`Rendering chapter ${index + 1}/${totalSpineItems}...`, chapterProgress * 0.7);
            ctx?.log(`Rendering chapter ${index + 1}/${totalSpineItems}...`);

            const item = (currentBook.spine as any).get ? (currentBook.spine as any).get(index) : spineItems[index];

            try {
              await rendition.display(item.href);
              const contentsList = rendition.getContents() as any;

              if (contentsList && contentsList.length > 0) {
                const sectionDoc = contentsList[0].document;
                const headStyles = Array.from(sectionDoc.querySelectorAll('style, link[rel="stylesheet"]'))
                  .map((node: any) => node.outerHTML);
                const bodyHTML = sectionDoc.body.innerHTML;

                results[index] = { headStyles, bodyHTML };
              }
            } catch (e) {
              ctx?.log(`Failed to render chapter ${index + 1}: ${e}`, "warn");
            }

            completedChapters++;
          }

          rendition.destroy();
          container.remove();
        };

        const workers = Array.from({ length: Math.min(CONCURRENCY, totalSpineItems) }, () => processWorker());
        await Promise.all(workers);

        ctx?.progress("Assembling chapters...", 0.7);
        ctx?.log("Assembling chapters...");

        for (let i = 0; i < totalSpineItems; i++) {
            const res = results[i];
            if (!res) continue;

            const tempDiv = printDoc.createElement('div');
            tempDiv.innerHTML = res.headStyles.join('\n');

            Array.from(tempDiv.childNodes).forEach((node: any) => {
                if (node.nodeName.toLowerCase() === 'link') {
                    if (!injectedStyles.has(node.href)) {
                        injectedStyles.add(node.href);
                        head.appendChild(node.cloneNode(true));
                    }
                } else if (node.nodeName.toLowerCase() === 'style') {
                    head.appendChild(node.cloneNode(true));
                }
            });

            const sectionWrapper = printDoc.createElement('div');
            sectionWrapper.className = 'epub-section';
            sectionWrapper.innerHTML = res.bodyHTML;
            printContent.appendChild(sectionWrapper);
        }

        const cssLinks = Array.from(printDoc.querySelectorAll('link[rel="stylesheet"]'));
        ctx?.progress("Resolving stylesheets...", 0.8);
        ctx?.log(`Resolving ${cssLinks.length} dynamic stylesheets...`);

        const cssFetchPromises = cssLinks.map(async (link) => {
          const href = (link as HTMLLinkElement).href;
          if (href.startsWith('blob:')) {
            try {
              const response = await fetch(href);
              const text = await replaceBlobUrlsInCss(await response.text(), blobUrlCache);
              const style = printDoc.createElement('style');
              style.textContent = text;
              link.replaceWith(style);
            } catch (e) {
              ctx?.log(`Failed to fetch blob CSS: ${e}`, "warn");
            }
          }
        });
        await Promise.all(cssFetchPromises);

        ctx?.progress("Inlining assets...", 0.9);
        ctx?.log("Inlining blob-backed asset references...");
        await inlineBlobBackedAttributes(printDoc, blobUrlCache);

        ctx?.progress("Assembling final HTML...", 0.95);
        ctx?.log("Assembling final HTML...");
        const finalHtml = "<!DOCTYPE html>\n" + printDoc.documentElement.outerHTML;
        
        printIframe.remove();
        epubContainer.remove();

        outputFiles.push({
          name: `${baseName}.html`,
          bytes: new TextEncoder().encode(finalHtml)
        });

        ctx?.progress("Conversion complete!", 1);
        ctx?.log(`Successfully converted ${baseName}.epub to HTML`);
      }
    }

    return outputFiles;
  }
}

export default EpubHandler;
