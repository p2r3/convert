<div align="center">

<img src="docs/logo.png" alt="" width="96">

# [Convert to it!](https://convert.to.it/)

**Truly universal online file converter.**

[What this fork adds](#what-this-fork-adds) · [Usage](#usage) · [Run it yourself](#deployment) · [Contributing](#contributing) · [Acknowledgements](#acknowledgements)

![Licence: GPL-2.0](https://img.shields.io/badge/licence-GPL--2.0-blue)
[![Fork of p2r3/convert](https://img.shields.io/badge/fork%20of-p2r3%2Fconvert-8250df)](https://github.com/p2r3/convert)
![Runs in the browser](https://img.shields.io/badge/uploads-none-brightgreen)
![Built with Bun and Vite](https://img.shields.io/badge/built%20with-Bun%20%2B%20Vite-black)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png">
  <img src="docs/screenshot-light.png" alt="An MP4 file loaded and GIF chosen as the output, out of 81 image formats; category filters run from Image and Video to 3D Model and Database" width="860">
</picture>

</div>

Many online file conversion tools are **boring** and **insecure**. They only allow conversion between two formats in the same medium (images to images, videos to videos, etc.), and they require that you _upload your files to some server_.

This is not just terrible for privacy, it's also incredibly lame. What if you _really_ need to convert an AVI video to a PDF document? Try to find an online tool for that, I dare you.

[Convert.to.it](https://convert.to.it/) aims to be a tool that "just works". You're almost _guaranteed_ to get an output - perhaps not always the one you expected, but it'll try its best to not leave you hanging.

For a semi-technical overview of this tool, check out the video: https://youtu.be/btUbcsTbVA8

## What this fork adds

This is a fork of [p2r3/convert](https://github.com/p2r3/convert). The rest of this README is the original project's, apart from the notes that mention the fork. [CHANGELOG.md](CHANGELOG.md) lists every changed file.

<img src="docs/settings.png" alt="The Output settings dialog for an MP4 to GIF conversion, with a frame rate field" width="350" align="right">

- **Per-conversion output settings.** A Settings button next to Convert offers the options that fit the chosen format: image quality, frame rate, video and audio bitrate, longest side, start and end time, and removing metadata. Leave a field empty to use the default.
- **Better GIFs.** GIF output from the FFmpeg handler generates its palette in a first pass and uses it in a second.
- **Adding files to a selection that is already open.**

<br clear="right">

<img src="docs/multi-file.png" alt="Four files of three types in the file bar, each labelled with its own output: a JPG to JPEG, one PNG to OCR, another PNG to NOBG and an SVG to SVG" width="860">

- **A different output for every file.** Files of different types can be added together. Click a file in the bar to choose its output. A choice applies to all files of that type unless you untick "All files".
- **One download.** Several outputs arrive as one zip, built with [zip.js](https://github.com/gildas-lormeau/zip.js). A password in Settings encrypts it with AES-256.
- **Compress.** Converts a file to its own format and makes it smaller: JPEG, WebP and AVIF are re-encoded, video and audio are transcoded, and SVG, HTML, CSS, JavaScript and JSON are minified. If the result is not smaller, you get the original back.
- **Three new outputs.** "Recognised text (OCR)" reads English and Dutch text from images and PDF pages, "PNG with background removed" cuts out the subject of an image, and "Merged PDF" joins the selected PDFs in the order of the file bar.

<details>
<summary>Limits of these additions</summary>

- The output settings are read by four of the conversion tools (FFmpeg, mediabunny, ImageMagick and the browser canvas). When a conversion ends in another tool, the result popup says the settings were not applied.
- Background removal uses a small model (U2-Net "u2netp"). It works well on clear subjects and is rough on hair and fine edges. Its first use downloads about 19 MB.
- OCR downloads about 10 MB on first use. A PDF with several pages gives one text file per page.
- Windows Explorer and macOS Archive Utility cannot open AES-encrypted zips; 7-Zip and Keka can.
- Compress has no effect on formats that are already lossless or compressed, such as PNG, ZIP and PDF.

</details>

## Usage

1. Go to [convert.to.it](https://convert.to.it/). That is the original project's hosted version; to use this fork's additions, [run it yourself](#deployment).
2. Click the big box to add your file (or just drag it on to the window).
3. An input format should have been automatically selected (as shown at the top). If not, yikes! Try pressing "Show all" and searching for it, or if it's really not there, see the "Issues" section below.
4. Press "Next" and select your output format.
5. Click **Convert**!
6. Hopefully, after a bit (or a lot) of thinking, the program will spit out the file you wanted. If not, see the "Issues" section below.

## Issues

Ever since the YouTube video released, we've been getting spammed with issues suggesting the addition of all kinds of niche file formats. To keep things organized, I've decided to specify what counts as a valid issue and what doesn't.

> [!IMPORTANT]
> **SIMPLY ASKING FOR A FILE FORMAT TO BE ADDED IS NOT A MEANINGFUL ISSUE!**

There are thousands of file formats out there. It can take hours to add support for just one. The math is simple - we can't possibly support every single file. As such, simply listing your favorite file formats is not helpful. We already know that there are formats we don't support, we don't need tickets to tell us that.

When suggesting a file format, you must _at minimum_:

- Make sure that there isn't already an issue about the same thing, and that we don't already support the format.
- Explain what you expect the conversion to be like (what medium is it converting to/from). It's important to note here that simply parsing the underlying data is _not sufficient_. Imagine if we only treated SVG images as raw XML data and didn't support converting them to raster images - that would defeat the point. In other words, try to avoid crude "binary waterfalls".
- Provide links to existing browser-based solutions if possible, or at the very least a reference for implementing the format, and make sure the license is compatible with GPL-2.0.

If this seems like a lot, please remember - a developer will have to do 100x more work to actually implement the format. Doing a bit of research not only saves them precious time, it also weeds out "unserious" proposals that would only bloat our to-do list.

**If you're submitting a bug report,** you only need to do step 1 - check if the problem isn't already reported by someone else. Bug reports are generally quite important otherwise.

Though please note, "converting X to Y doesn't work" is **not** a bug report. However, "converting X to Y works but not how I expected" likely **is** a bug report.

## Deployment

### Local development (Bun + Vite)

1. Clone this repository.
2. Install [Bun](https://bun.sh/).
3. Run `bun install` to install dependencies.
4. Run `bun run dev` to prepare and start the development server.

_The following steps are optional, but recommended for performance:_

When you first open the page, it'll take a while to generate the list of supported formats for each tool. If you open the console, you'll see it complaining a bunch about missing caches.

You can generate this list beforehand and save it into `dist/` by running `bun run cache:build` after `bun run build`. If you run into issues where your changes seem to not be applying, try deleting `dist/cache.json`.

### Docker (prebuilt image)

> [!NOTE]
> The prebuilt image is the original project's and does not have this fork's additions. For those, use the [local build](#docker-local-build-for-development) below.

Docker compose files live in the `docker/` directory, so run compose with `-f` from the repository root:

```bash
docker compose -f docker/docker-compose.yml up -d
```

Alternatively download the `docker-compose.yml` separately and start it by executing `docker compose up -d` in the same directory.

This runs the container on `http://localhost:8080/convert/`.

### Docker (local build for development)

Use the override file to build the image locally:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up --build -d
```

The first Docker build is expected to be slow because Chromium and related system packages are installed in the build stage (needed for puppeteer in `buildCache.js`). Later builds are usually much faster due to Docker layer caching.

### Manual

Run `bun run build` and then `bun run cache:build`. Then serve the `dist/` folder on any HTTP server of your choice.

## Acknowledgements

Some features were inspired by other open source converters. The ideas were reimplemented here; no code was copied.

- [VERT](https://github.com/VERT-sh/VERT): per-conversion output settings.
- [CompressZ](https://github.com/ADJ189/CompressZ): two-pass GIF palette generation and bundling multiple outputs into one zip.
- [Arachnidium](https://github.com/p2r3/Arachnidium): minifying web formats and keeping the original when the result is not smaller.

The additions also use these projects:

| Project                                                                                                                                | Used for                             | Licence           |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------- |
| [zip.js](https://github.com/gildas-lormeau/zip.js) by Gildas Lormeau                                                                   | Zip download and encryption          | BSD-3-Clause      |
| [SVGO](https://github.com/svg/svgo)                                                                                                    | SVG minification                     | MIT               |
| [html-minifier-terser](https://github.com/terser/html-minifier-terser) and [terser](https://github.com/terser/terser)                  | HTML and JavaScript minification     | MIT, BSD-2-Clause |
| [tesseract.js](https://github.com/naptha/tesseract.js) and [Tesseract](https://github.com/tesseract-ocr/tesseract)                     | OCR                                  | Apache-2.0        |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime)                                                                               | Running the background removal model | MIT               |
| [U2-Net](https://github.com/xuebinqin/U-2-Net) by Xuebin Qin and others, model file from [rembg](https://github.com/danielgatis/rembg) | Background removal model             | Apache-2.0        |

This is a fork of [p2r3/convert](https://github.com/p2r3/convert). [NOTICE](NOTICE) says where it comes from and what is known about the licences of its dependencies; [CHANGELOG.md](CHANGELOG.md) lists what the fork changes.

## Contributing

The best way to contribute is by adding support for new file formats (duh). If you don't have a format to add but are eager to help, take a look at our issues. There are plenty of suggestions there.

Here's how adding a format works works:

### Creating a handler

Each "tool" used for conversion has to be normalized to a standard form - effectively a "wrapper" that abstracts away the internal processes. These wrappers are available in [src/handlers](src/handlers/).

Below is a super barebones handler that does absolutely nothing. You can use this as a starting point for adding a new format:

```ts
// file: dummy.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import Formats from "src/Formats.ts";

class dummyHandler implements FormatHandler {
  public readonly name = "dummy";
  public supportedFormats = [
    Formats.PNG.builder("png").lossless().fromTo(),
    // modifiers go before the direction
    Formats.GIF.builder("gif").to(),
    // add custom formats to Formats.ts
  ];
  public ready = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    return outputFiles;
  }
}

export default dummyHandler;
```

After that, make sure to add add `dummy: []` into the HANDLERS array in [src/handlers/index.ts](src/handlers/index.ts) so it can be used in conversions.

For more details on how all of these components work, refer to the doc comments in [src/FormatHandler.ts](src/FormatHandler.ts). You can also take a look at existing handlers to get a more practical example.

There are a few additional things that I want to point out in particular:

- Pay attention to the naming system. If your tool is called `dummy`, then the class should be called `dummyHandler`, and the file should be called `dummy.ts`.
- The handler is responsible for setting the output file's name. This is done to allow for flexibility in rare cases where the _full_ file name matters. Of course, in most cases, you'll only have to swap the file extension.
- The handler is also responsible for ensuring that any FileData or byte buffer objects that enter the handler _do not get mutated_. If necessary, clone the buffer by wrapping it in `new Uint8Array()`.
- When handling MIME types, run them through [normalizeMimeType](src/normalizeMimeType.ts) first. One file can have multiple valid MIME types, which isn't great when you're trying to match them algorithmically.
- Your handler may run in a web worker, so make sure that you do not use any incompatible Web APIs. `HTMLCanvasElement` -> `OffscreenCanvas` (`toBlob()` -> `convertToBlob()`), `new Image()` -> `createImageBitmap()`, avoid web audio and DOM APIs where possible. `offload` is last resort.
- When implementing/suggesting a new file format, please treat the file as the media that it represents, not the data that it contains. For example, if you were making an SVG handler, you should treat the file as an _image_, not as XML. In other words, avoid simple "binary waterfalls", as they're not semantically meaningful.

### Testing

This project currently uses two levels of tests:

- Broad project-level tests live directly in `test/` (for example graph traversal and end-to-end conversion smoke tests).
- Optional handler-specific unit tests live in `test/handlers/`, using the file name pattern `<handlerName>.test.ts`. These are a good fit for handlers with meaningful parsing, serialization, or file-naming logic that is hard to exercise reliably through traversal alone.

Not every handler needs a dedicated unit test, but handlers with non-trivial custom internal logic may benefit from having one.

### Adding dependencies

If your tool requires an external dependency (which it likely does), there are currently two well-established ways of going about this:

- If it's an `npm` package, just install it to the project like you normally would.
- Everything else should use our build system. Usually you can just run `bun run build:add <name> <tar.gz or zip url>`, then `bun run build:assemble`, then import from the `built/<name>` folder. The full reference is under [recipe/README.md](recipe/README.md).

**Please do not use CDNs (Content Delivery Networks).** They're really cool on paper, but they don't work well with TypeScript, and each one introduces a tiny bit of instability. For a project that leans heavily on external dependencies, those bits of instability can add up fast.

- If you need to load a WebAssembly binary (or similar), use vite's ?url imports, like `import wasmUrl from "node_modules/stuff/wasm.wasm?url"` (or copy it into the output using vite.config.js). Don't try to fetch stuff from node_modules directly.

### AI Usage Policy

If you intend to use an AI/agentic/LLM tool for your contribution, please follow these guidelines:

- State where and how you used the LLM. Not disclosing it may get your PR insta-closed.
- Do not use it to write descriptions for issues/PRs (except for translation). This may also lead to your contribution being insta-closed.
- Explain what you (and the LLM) are doing, in a way that makes it clear that you understand the changes you're making.
- Review the full diff of your PR manually (skipping over bulk thoughtless parts is fine).
- Keep the scope to things you could do by hand. In other words, there should _never_ be a scenario where you _need_ an LLM. In other other words, if you don't understand what the LLM did, don't pull request it.
- Do not overindulge. If your contribution is trivial or simple enough to be written by hand, please opt to write it by hand, especially if it's your first contribution. You are much more likely to retain architectural knowledge that way.
- All agentic tools are not allowed to create pull requests without human oversight.

Not adhering to these rules will likely get your pull request closed.

I figure that there are people who'd prefer if I merged _zero_ AI-written code, but I believe that's simply not feasible. Just from a code integrity perspective, it's much safer to be transparent about AI usage and define clear guidelines than to make it a taboo and risk people "sneaking in" unvetted AI code. Making things illegal doesn't stop everyone from doing those things - some will still do them, just in secret and with less oversight.
