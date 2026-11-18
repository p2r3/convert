import puppeteer from "puppeteer";
import { preview } from "vite";

const minify = process.argv[3] === "--minify";

const outputPath = process.argv[2] || "cache.json";
// delete previous cache.json so regeneration is forced to happen
const outputFile = Bun.file(outputPath);
if (await outputFile.exists()) {
  await outputFile.delete();
}

const server = await preview({ logLevel: "silent", preview: { port: 0 } });

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const page = await browser.newPage();

const TIMEOUT_MS = 10 * 60 * 1000;
let timeout;

try {
  await Promise.all([
    new Promise((resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error("Timed out waiting for the format list.")),
        TIMEOUT_MS,
      );
      page.on("pageerror", (error) => console.error(error));
      page.on("console", (msg) => {
        const text = msg.text();
        if (msg.type() === "error") console.error(text);
        if (text === "Built initial format list.") resolve();
        if (text.startsWith("Failed to build initial format list.")) reject(new Error(text));
      });
    }),
    page.goto(server.resolvedUrls.local[0]),
  ]);

  const cacheJSON = await page.evaluate((minify) => {
    if (minify) {
      return JSON.stringify(JSON.parse(window.printSupportedFormatCache()));
    }
    return window.printSupportedFormatCache();
  }, minify);

  await Bun.write(outputPath, cacheJSON);
} finally {
  clearTimeout(timeout);
  await browser.close();
  await server.close();
}

console.log("All done.");
