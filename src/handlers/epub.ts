import Formats from "../Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import type { ConvertContext } from "../ui/ProgressStore.ts";
import ePub from "epubjs";
import { WorkerDOMParser } from "src/common/dom.ts";
import { XMLSerializer, type Node as XmlNode } from "@xmldom/xmldom";
import { encode, stripExt } from "src/common/index.ts";
import type Section from "epubjs/types/section";

const DOMParser = WorkerDOMParser;

function blobUrlRegex() {
  return /url\(\s*(['"]?)(blob:[^'")\s]+)\1\s*\)/gu;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("loadend", () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read the blob as a data URL.")),
    );
    reader.addEventListener("error", reject);
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
  const urls = Array.from(cssText.matchAll(blobUrlRegex())).map((match) => match[2]);
  const uniqueUrls = Array.from(new Set(urls));

  if (uniqueUrls.length === 0) return cssText;

  const replacements = new Map<string, string>();
  await Promise.all(
    uniqueUrls.map(async (url) => {
      replacements.set(url, await blobUrlToDataUrl(url, cache));
    }),
  );

  return cssText.replace(blobUrlRegex(), (full, quote, url) => {
    const replacement = replacements.get(url);
    if (!replacement) return full;
    const normalizedQuote = quote || '"';
    return `url(${normalizedQuote}${replacement}${normalizedQuote})`;
  });
}

async function inlineBlobBackedAttributes(printDoc: Document, cache: Map<string, Promise<string>>) {
  const attributeNames = ["src", "poster", "href", "xlink:href", "data"];

  for (const attributeName of attributeNames) {
    const nodes = Array.from(printDoc.querySelectorAll(`[${attributeName.replace(":", "\\:")}]`));
    await Promise.all(
      nodes.map(async (node) => {
        const value = node.getAttribute(attributeName);
        if (!value?.startsWith("blob:")) return;
        node.setAttribute(attributeName, await blobUrlToDataUrl(value, cache));
      }),
    );
  }

  const srcsetNodes = Array.from(printDoc.querySelectorAll("[srcset]"));
  await Promise.all(
    srcsetNodes.map(async (node) => {
      const srcset = node.getAttribute("srcset");
      if (!srcset?.includes("blob:")) return;

      const rewritten = await Promise.all(
        srcset.split(",").map(async (candidate) => {
          const trimmed = candidate.trim();
          if (!trimmed.startsWith("blob:")) return candidate;

          const [url, ...descriptors] = trimmed.split(/\s+/u);
          const dataUrl = await blobUrlToDataUrl(url, cache);
          return [dataUrl, ...descriptors].join(" ");
        }),
      );

      node.setAttribute("srcset", rewritten.join(", "));
    }),
  );

  const styledNodes = Array.from(printDoc.querySelectorAll("[style]"));
  await Promise.all(
    styledNodes.map(async (node) => {
      const style = node.getAttribute("style");
      if (!style?.includes("blob:")) return;
      node.setAttribute("style", await replaceBlobUrlsInCss(style, cache));
    }),
  );

  const styleTags = Array.from(printDoc.querySelectorAll("style"));
  await Promise.all(
    styleTags.map(async (styleTag) => {
      const cssText = styleTag.textContent;
      if (!cssText?.includes("blob:")) return;
      styleTag.textContent = await replaceBlobUrlsInCss(cssText, cache);
    }),
  );
}

export default class epubHandler implements FormatHandler {
  public readonly name = "epub";
  public supportedFormats = [
    Formats.EPUB.builder("epub").from(),
    Formats.HTML.builder("html").to(),
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
    if (!this.ready) throw new Error("Handler not initialized.");

    const outputFiles: FileData[] = [];
    const blobUrlCache = new Map<string, Promise<string>>();

    for (const file of inputFiles) {
      await ctx?.checkpoint();
      const baseName = stripExt(file.name);

      if (outputFormat.internal === "html") {
        // Extract buffer
        const arrayBuffer = file.bytes.buffer.slice(
          file.bytes.byteOffset,
          file.bytes.byteOffset + file.bytes.byteLength,
        );

        ctx?.log(`Parsing EPUB buffer (${file.bytes.byteLength} bytes)...`);
        const currentBook = ePub(arrayBuffer);
        await currentBook.opened;
        ctx?.log(`EPUB ready. Formatting container...`);

        const printDoc = new DOMParser().parseFromString(
          `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>${currentBook.packaging?.metadata?.title || baseName}</title>
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
        `,
          "text/html",
        );

        const printContent = printDoc.getElementById("print-content")!;
        const head = printDoc.head;
        const injectedStyles = new Set<string>();

        const spineItems: Section[] = [];
        currentBook.spine.each((item: Section) => spineItems.push(item));
        const totalSpineItems = spineItems.length;

        if (totalSpineItems === 0) {
          throw new Error("No spine items found in the EPUB.");
        }

        ctx?.log(`Found ${totalSpineItems} spine chapters. Rendering concurrently...`);

        const CONCURRENCY = 8;
        const results: Array<{ headStyles: string[]; bodyHTML: string } | null> = Array.from(
          { length: totalSpineItems },
          () => null,
        );
        let currentIndex = 0;

        const processWorker = async () => {
          while (true) {
            if (await ctx?.aborted()) break;
            const index = currentIndex++;
            if (index >= totalSpineItems) break;

            ctx?.log(`Rendering chapter ${index + 1}/${totalSpineItems}...`);

            const item = spineItems[index];

            try {
              // epubjs's typings say load returns the Document, it really returns a promise of it
              // oxlint-disable-next-line typescript/await-thenable
              await item.load(currentBook.load.bind(currentBook));
              const html = currentBook.resources.substitute(
                // epubjs types its documents as DOM ones, xmldom's serializer only walks the nodes
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion
                new XMLSerializer().serializeToString(item.document as unknown as XmlNode),
                item.url,
              );
              const sectionDoc = new DOMParser().parseFromString(html, "text/html");
              const headStyles = Array.from(
                sectionDoc.querySelectorAll('style, link[rel="stylesheet"]'),
              ).map((node) => node.outerHTML);
              const bodyHTML = sectionDoc.body.innerHTML;

              results[index] = { headStyles, bodyHTML };
            } catch (e) {
              ctx?.log(
                `Failed to render chapter ${index + 1}: ${e instanceof Error ? e.message : String(e)}`,
                "error",
              );
            }
          }
        };

        const workers = Array.from({ length: Math.min(CONCURRENCY, totalSpineItems) }, () =>
          processWorker(),
        );
        await Promise.all(workers);
        if (await ctx?.aborted()) {
          currentBook.destroy();
          await ctx?.checkpoint();
        }

        for (let i = 0; i < totalSpineItems; i++) {
          const res = results[i];
          if (!res) continue;

          const tempDiv = printDoc.createElement("div");
          tempDiv.innerHTML = res.headStyles.join("\n");

          Array.from(tempDiv.childNodes).forEach((node: any) => {
            if (node.nodeName.toLowerCase() === "link") {
              if (!injectedStyles.has(node.href)) {
                injectedStyles.add(node.href);
                head.appendChild(node.cloneNode(true));
              }
            } else if (node.nodeName.toLowerCase() === "style") {
              head.appendChild(node.cloneNode(true));
            }
          });

          const sectionWrapper = printDoc.createElement("div");
          sectionWrapper.className = "epub-section";
          sectionWrapper.innerHTML = res.bodyHTML;
          printContent.appendChild(sectionWrapper);
        }

        // Cleanup blob CSS links by inline fetching
        const cssLinks = Array.from(printDoc.querySelectorAll('link[rel="stylesheet"]'));
        ctx?.log(`Chapters concatenated. Resolving ${cssLinks.length} dynamic stylesheets...`);
        const cssFetchPromises = cssLinks.map(async (link) => {
          const href = link.getAttribute("href") ?? "";
          if (href.startsWith("blob:")) {
            try {
              const response = await fetch(href);
              const text = await replaceBlobUrlsInCss(await response.text(), blobUrlCache);
              const style = printDoc.createElement("style");
              style.textContent = text;
              link.replaceWith(style);
            } catch (e) {
              ctx?.log(
                `Failed to fetch blob CSS: ${e instanceof Error ? e.message : String(e)}`,
                "error",
              );
            }
          }
        });
        await Promise.all(cssFetchPromises);

        ctx?.log("Inlining remaining blob-backed asset references...");
        await inlineBlobBackedAttributes(printDoc, blobUrlCache);

        // Gather fully merged HTML
        ctx?.log("Assembling final HTML layout buffer...");
        const finalHtml = "<!DOCTYPE html>\n" + printDoc.documentElement.outerHTML;

        currentBook.destroy();

        outputFiles.push({
          name: `${baseName}.html`,
          bytes: encode(finalHtml),
        });
      }
    }

    return outputFiles;
  }
}
