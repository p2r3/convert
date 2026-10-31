import { expect, test } from "bun:test";
import puppeteer from "puppeteer";
import { preview } from "vite";
import { readFile } from "node:fs/promises";
import { stripHandler, type HandlerDefinition } from "../src/FormatHandler";
import Config from "../src/handlers/config";
import Canvas from "../src/handlers/canvasToBlob";
import ALS from "../src/handlers/als";
import {
  txtToInfiniteCraftHandler,
  infiniteCraftToJsonHandler,
} from "../src/handlers/infiniteCraft";

// Supply a complete cache to avoid downloading every engine just to test the UI.
const source = await readFile(new URL("../src/handlers/index.ts", import.meta.url), "utf8");
const names = Array.from(
  source
    .split("const HANDLERS = {")[1]
    .split("} as const")[0]
    .matchAll(/^  (\w+):/gm),
  (match) => match[1],
);
const definitions = [
  new Config(),
  new Canvas(),
  new ALS(),
  new txtToInfiniteCraftHandler(),
  new infiniteCraftToJsonHandler(),
].map(stripHandler);
const cache = names.map(
  (name) => definitions.find((def) => def.name === name) || { name, supportedFormats: [] },
);

for (const legacy of [false, true]) {
  test(`${legacy ? "legacy" : "modern"} production bundle converts JSON, gzip and images`, async () => {
    const legacyHTML = (await readFile(new URL("../dist/index.html", import.meta.url), "utf8"))
      .replace(/<script\b[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g, "")
      .replace(/<link\b[^>]*rel="modulepreload"[^>]*>/g, "")
      .replace(/\snomodule\b/g, "");
    const messages: string[] = [];
    const errors: string[] = [];
    const server = await preview({
      logLevel: "silent",
      preview: { port: 0 },
      plugins: [
        {
          name: "compatibility-fixtures",
          configurePreviewServer(server) {
            server.middlewares.use((req, res, next) => {
              if (req.url === "/cache.json") {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(cache));
              } else if (req.url === "/legacy.html") {
                res.setHeader("Content-Type", "text/html");
                res.end(legacyHTML);
              } else next();
            });
          },
        },
      ],
    });
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      page.on("console", (message) => messages.push(message.text()));
      page.on("pageerror", (error) => errors.push(String(error)));
      if (legacy) {
        await page.evaluateOnNewDocument(() => {
          for (const name of [
            "Worker",
            "OffscreenCanvas",
            "createImageBitmap",
            "WebAssembly",
            "BigInt",
            "BigInt64Array",
            "CompressionStream",
            "DecompressionStream",
            "ReadableStream",
            "WritableStream",
            "TransformStream",
            "TextEncoder",
            "TextDecoder",
            "AbortController",
            "AbortSignal",
            "fetch",
            "Request",
            "Response",
            "Headers",
          ]) {
            Object.defineProperty(globalThis, name, {
              value: undefined,
              configurable: true,
              writable: true,
            });
          }
          for (const name of ["arrayBuffer", "text", "stream"])
            delete (Blob.prototype as unknown as Record<string, unknown>)[name];
          Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
            value: undefined,
            configurable: true,
            writable: true,
          });
          Object.defineProperty(MediaQueryList.prototype, "addEventListener", {
            value: undefined,
            configurable: true,
          });
        });
      }
      await page.goto(`${server.resolvedUrls!.local[0]}${legacy ? "legacy.html" : ""}`);
      await page.waitForFunction(
        () => document.querySelector(".upload-dropzone")?.getAttribute("aria-disabled") === "false",
        { timeout: 30000 },
      );
      const result = await page.evaluate(async () => {
        // This function executes in the browser, so it must be inside evaluate.
        // oxlint-disable-next-line unicorn/consistent-function-scoping
        const convert = async (name: string, input: string, output: string, bytes: number[]) => {
          const handler = window.handlerDefs.find((def) => def.name === name)!;
          const from = {
            handler,
            format: handler.supportedFormats!.find((format) => format.internal === input)!,
          };
          const to = {
            handler,
            format: handler.supportedFormats!.find((format) => format.internal === output)!,
          };
          const result = await window.tryConvertByTraversing(
            [{ name: "test", bytes: new Uint8Array(bytes) }],
            from,
            to,
          );
          if (!result) throw new Error(`No result for ${name}: ${input} → ${output}`);
          return Array.from(result.files[0].bytes);
        };
        const json = await convert(
          "config",
          "json5",
          "json",
          Array.from(new TextEncoder().encode("{unquoted: 'works'}")),
        );
        const png = await convert(
          "canvasToBlob",
          "text",
          "png",
          Array.from(new TextEncoder().encode("compatibility")),
        );
        const jpeg = await convert("canvasToBlob", "png", "jpeg", png);
        const ic = await convert(
          "txtToInfiniteCraft",
          "text",
          "ic",
          Array.from(new TextEncoder().encode("Fire\nWater")),
        );
        const unpacked = await convert("infiniteCraftToJson", "ic", "json", ic);
        return {
          json: JSON.parse(new TextDecoder().decode(new Uint8Array(json))),
          png: png.slice(0, 4),
          jpeg: jpeg.slice(0, 2),
          gzip: ic.slice(0, 2),
          unpacked: JSON.parse(new TextDecoder().decode(new Uint8Array(unpacked))),
          engines: window.handlerDefs.map((def: HandlerDefinition) => def.name),
        };
      });
      expect(result.json).toEqual({ unquoted: "works" });
      expect(result.png).toEqual([137, 80, 78, 71]);
      expect(result.jpeg).toEqual([255, 216]);
      expect(result.gzip).toEqual([31, 139]);
      expect(result.unpacked).toBeObject();
      expect(result.engines.includes("ImageMagick")).toBe(true);
      expect(result.engines.includes("pdfjs")).toBe(true);
      expect(
        messages.some((message) =>
          message.includes(
            legacy
              ? "Chose converter main_thread for config"
              : "Chose converter web_worker_config for config",
          ),
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    } catch (error) {
      console.error(messages.slice(0, 20), messages.slice(-15), errors);
      throw error;
    } finally {
      await browser.close();
      await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
    }
  }, 60000);
}
