import puppeteer from "puppeteer";

const minify = (process.argv[3] === "--minify");

const outputPath = process.argv[2] || "cache.json";
// delete previous cache.json so regeneration is forced to happen
const outputFile = Bun.file(outputPath);
if (await outputFile.exists()) {
  await outputFile.delete();
}

const server = Bun.serve({
  async fetch (req) {
    const path = new URL(req.url).pathname.replace("/convert/", "") || "index.html";
    const file = Bun.file(`${__dirname}/dist/${path}`.replaceAll("..", ""));
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });
    return new Response(file);
  },
  port: 8080
});

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});

const page = await browser.newPage();

await Promise.all([
  new Promise(resolve => {
    page.on("console", msg => {
      const text = msg.text();
      if (text === "Built initial format list.") resolve();
    });
  }),
  page.goto("http://localhost:8080/convert/index.html")
]);

const cacheJSON = await page.evaluate((minify) => {
  if (minify === true) {
    return JSON.stringify(
      JSON.parse(
        window.printSupportedFormatCache()
      )
    );
  }
  return window.printSupportedFormatCache();
}, minify);

await Bun.write(outputPath, cacheJSON);

await browser.close();
server.stop();
