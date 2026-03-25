import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { expect, test } from "bun:test";
import {
  TYPST_PAGEBREAK_MARKER,
  bundleTypstAssets,
  postprocessTypstFromPandoc,
  preprocessHtmlForTypst,
} from "../src/handlers/pandoc.ts";
import { unpackTypstAssets } from "../src/handlers/typst.ts";

GlobalRegistrator.register();

test("preprocessHtmlForTypst injects a page break marker between slide-like containers", () => {
  const normalized = preprocessHtmlForTypst(`
    <div class="__page"><p>Slide 1</p></div>
    <div class="__page"><p>Slide 2</p></div>
  `);

  expect(normalized.match(new RegExp(TYPST_PAGEBREAK_MARKER, "gu"))?.length).toBe(1);
  expect(normalized).toContain(`${TYPST_PAGEBREAK_MARKER}</p><div class="__page"><p>Slide 2</p></div>`);
});

test("preprocessHtmlForTypst adds Typst-friendly attributes from inline HTML styles", () => {
  const normalized = preprocessHtmlForTypst(`
    <div style="background:#f5f1e8;padding:12pt;border:1pt solid #222;break-inside:avoid">
      <span style="color:#204060;font-size:14pt;font-family:'Fira Sans'">Hello</span>
      <img src="cover.png" style="width:100%;height:40pt">
    </div>
  `);

  expect(normalized).toContain('typst:fill="#f5f1e8"');
  expect(normalized).toContain('typst:inset="12pt"');
  expect(normalized).toContain('typst:stroke="1pt solid #222"');
  expect(normalized).toContain('typst:breakable="false"');
  expect(normalized).toContain('typst:text:fill="#204060"');
  expect(normalized).toContain('typst:text:size="14pt"');
  expect(normalized).toContain(`typst:text:font="'Fira Sans'"`);
  expect(normalized).toContain('width="100%"');
  expect(normalized).toContain('height="40pt"');
});

test("postprocessTypstFromPandoc rewrites standalone page break markers into Typst column breaks", () => {
  const typst = [
    "= Slide 1",
    "",
    TYPST_PAGEBREAK_MARKER,
    "",
    "= Slide 2",
  ].join("\n");

  expect(postprocessTypstFromPandoc(typst)).toContain("#colbreak(weak: true)");
});

test("bundleTypstAssets creates a Typst asset manifest that typst.ts can unpack", async () => {
  const typst = '#image("media/example.png")';
  const bundled = await bundleTypstAssets(typst, {
    "media/example.png": new Blob([new Uint8Array([1, 2, 3, 4])]),
  });

  const unpacked = unpackTypstAssets(bundled);

  expect(unpacked.mainContent).toBe(typst);
  expect(Array.from(unpacked.shadowFiles["media/example.png"])).toEqual([1, 2, 3, 4]);
});
