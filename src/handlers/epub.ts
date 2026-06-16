import CommonFormats from "../CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
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

  const replacements = new Map<string, string>();
  await Promise.all(uniqueUrls.map(async (url) => {
    replacements.set(url, await blobUrlToDataUrl(url, cache));
  }));

  return cssText.replace(blobUrlRegex(), (full, quote, url) => {
    const replacement = replacements.get(url);
    if (!replacement) return full;
    const normalizedQuote = quote || "\"";
    return `url(${normalizedQuote}${replacement}${normalizedQuote})`;
  });
}

async function inlineBlobBackedAttributes(
  printDoc: Document,
  cache: Map<string, Promise<string>>,
) {
  const attributeNames = ["src", "poster", "href", "xlink:href", "data"];

  for (const attributeName of attributeNames) {
    const nodes = Array.from(printDoc.querySelectorAll(`[${CSS.escape(attributeName)}]`));
    await Promise.all(nodes.map(async (node) => {
      const value = node.getAttribute(attributeName);
      if (!value?.startsWith("blob:")) return;
      node.setAttribute(attributeName, await blobUrlToDataUrl(value, cache));
    }));
  }

  const srcsetNodes = Array.from(printDoc.querySelectorAll("[srcset]"));
  await Promise.all(srcsetNodes.map(async (node) => {
    const srcset = node.getAttribute("srcset");
    if (!srcset?.includes("blob:")) return;

    const rewritten = await Promise.all(srcset
      .split(",")
      .map(async (candidate) => {
        const trimmed = candidate.trim();
        if (!trimmed.startsWith("blob:")) return candidate;

        const [url, ...descriptors] = trimmed.split(/\s+/u);
        const dataUrl = await blobUrlToDataUrl(url, cache);
        return [dataUrl, ...descriptors].join(" ");
      }));

    node.setAttribute("srcset", rewritten.join(", "));
  }));

  const styledNodes = Array.from(printDoc.querySelectorAll("[style]"));
  await Promise.all(styledNodes.map(async (node) => {
    const style = node.getAttribute("style");
    if (!style?.includes("blob:")) return;
    node.setAttribute("style", await replaceBlobUrlsInCss(style, cache));
  }));

  const styleTags = Array.from(printDoc.querySelectorAll("style"));
  await Promise.all(styleTags.map(async (styleTag) => {
    const cssText = styleTag.textContent;
    if (!cssText?.includes("blob:")) return;
    styleTag.textContent = await replaceBlobUrlsInCss(cssText, cache);
  }));
}

export default class EpubHandler implements FormatHandler {
  public name: string = "epubjs-html";
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
  ): Promise<FileData[]> {
    if (!this.ready) throw new Error("Handler not initialized.");

    const outputFiles: FileData[] = [];
    const blobUrlCache = new Map<string, Promise<string>>();

    for (const file of inputFiles) {
      const baseName = file.name.replace(/\.[^.]+$/u, "");

      if (outputFormat.internal === "html") {
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

        // Extract buffer
        const arrayBuffer = file.bytes.buffer.slice(
          file.bytes.byteOffset,
          file.bytes.byteOffset + file.bytes.byteLength
        );

        console.log(`EPUB to HTML: Parsing EPUB buffer (${file.bytes.byteLength} bytes)...`);
        const currentBook = ePub(arrayBuffer as ArrayBuffer);
        await currentBook.ready;
        console.log(`EPUB to HTML: EPUB ready. Formatting container...`);

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

        console.log(`EPUB to HTML: Found ${totalSpineItems} spine chapters. Rendering concurrently...`);

        const CONCURRENCY = 8;
        const results: Array<{ headStyles: string[], bodyHTML: string } | null> = new Array(totalSpineItems).fill(null);
        let currentIndex = 0;

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
            const index = currentIndex++;
            if (index >= totalSpineItems) break;

            console.log(`EPUB to HTML: Rendering chapter ${index + 1}/${totalSpineItems}...`);

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
              console.error("Worker failed chapter", index, e);
            }
          }

          rendition.destroy();
          container.remove();
        };

        const workers = Array.from({ length: Math.min(CONCURRENCY, totalSpineItems) }, () => processWorker());
        await Promise.all(workers);

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

        // Cleanup blob CSS links by inline fetching
        const cssLinks = Array.from(printDoc.querySelectorAll('link[rel="stylesheet"]'));
        console.log(`EPUB to HTML: Chapters concatenated. Resolving ${cssLinks.length} dynamic stylesheets...`);
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
              console.error("Failed to fetch blob css:", e);
            }
          }
        });
        await Promise.all(cssFetchPromises);

        console.log("EPUB to HTML: Inlining remaining blob-backed asset references...");
        await inlineBlobBackedAttributes(printDoc, blobUrlCache);

        // Gather fully merged HTML
        console.log("EPUB to HTML: Assembling final HTML layout buffer...");
        const finalHtml = "<!DOCTYPE html>\n" + printDoc.documentElement.outerHTML;
        
        // Remove helper nodes
        printIframe.remove();
        epubContainer.remove();

        outputFiles.push({
          name: `${baseName}.html`,
          bytes: new TextEncoder().encode(finalHtml)
        });

      }
    }

    return outputFiles;
  }
}
