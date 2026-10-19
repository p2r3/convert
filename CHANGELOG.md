# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changes in this fork

This repository is a fork of [p2r3/convert](https://github.com/p2r3/convert). The files below were changed or added by Lucas Van De Weerd between 2026-10-10 and 2026-10-12 and are, like the rest of the project, licensed under the GNU General Public License, version 2.

#### Added

- Per-conversion output settings (image quality, frame rate, video and audio bitrate): `src/ConversionSettings.ts`, `src/ui/components/ConversionSettings/`, with tests in `test/ConversionSettings.test.ts`.
- Two-pass palette generation for GIF output in the FFmpeg handler, and adding files to a selection that is already open.
- `NOTICE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, this changelog, a pull request template, `CODEOWNERS`, an issue template configuration and a Dependabot configuration.

- A separate output format for each selected file, and selections that mix file types: `src/batch.ts`, with tests in `test/batch.test.ts`.
- Zip downloads built with zip.js, with an optional AES-256 password.
- Compressing a file into its own format, with minifiers for SVG, HTML, CSS, JavaScript and JSON: `src/handlers/minify.ts`, with tests in `test/handlers/minify.test.ts`.
- Three output formats: recognised text (`src/handlers/ocr.ts`), PNG with the background removed (`src/handlers/removeBg.ts`) and merged PDF (`src/handlers/mergePdf.ts`, with tests in `test/handlers/mergePdf.test.ts`).
- Output settings for the longest side, start and end time, and removing metadata.
- Dependencies: `@zip.js/zip.js`, `svgo`, `html-minifier-terser`, `terser`, `tesseract.js`, `tesseract.js-core`, `@tesseract.js-data/eng`, `@tesseract.js-data/nld` and `onnxruntime-web`; the `u2netp` model in `recipe/requirements.config.ts`.
- `docs/multi-file.png`.

- A liquid glass action bar and dialogs, using LiquidGlass UI: `src/ui/glass.css`, with `liquid-glass-ui` in `recipe/requirements.config.ts`.
- Tests for choosing a target per file (`test/batch.test.ts`) and for the longest side setting on a video (`test/commonFormats.test.ts`).

- Compressing a PNG without changing its pixels, with OxiPNG: `src/handlers/oxipng.ts`, with tests in `test/handlers/oxipng.test.ts`. Dependency: `@jsquash/oxipng`.
- Compressing a PDF, and a "PDF pages" output that writes each page as its own file: `src/handlers/pdfTools.ts`, with tests in `test/handlers/pdfTools.test.ts`.
- Output settings for the pages of a PDF to keep, for rotating its pages, and for cutting video and audio without re-encoding.
- Colour dispersion at the edge of the glass action bar: `src/ui/glass.ts`.

- 3D model conversion with the loaders and exporters of three.js: `src/handlers/threeModels.ts`.
- Subtitle conversion between SRT, WebVTT and ASS: `src/handlers/subtitles.ts`.
- Spreadsheet conversion with SheetJS: `src/handlers/sheetjs.ts`, `recipe/sheetjs/`, with tests in `test/handlers/sheetjs.test.ts`.
- Outlook messages to EML and text (`src/handlers/outlookMsg.ts`, with tests in `test/handlers/outlookMsg.test.ts`) and vCard contacts to JSON (`src/handlers/vcard.ts`, with tests in `test/handlers/vcard.test.ts`). Dependency: `@kenjiuno/msgreader`.
- Upscaling of images and video with WebSR: `src/handlers/upscale.ts`. Dependency: `@websr/websr`.
- Threads on cross-origin isolated pages, with tests in `test/threads.test.ts` and `test/common.test.ts`. Dependencies: `@ffmpeg/core-mt` and `coi-serviceworker`.

- A Tools row above the format list with the outputs that fit the selected file, and a Help section about them: `src/batch.ts` (`toolsFor`, with tests in `test/batch.test.ts`), `src/ui/components/Conversion/FormatExplorer/`, `src/ui/pages/Conversion/index.tsx`, `src/ui/components/HelpButton/index.tsx`, `src/ConversionSettings.ts`.
- `start.command` and the `start` script in `package.json`, which serve the build on port 4319 and open it, and a message in `index.html` for a page opened from disk.
- A Content Security Policy in the build, with the inline scripts of `index.html` allowed by hash: `vite.config.js`.

- A "Check audio" tool that runs [audiocheck](https://github.com/Gitguy268/audiocheck) on MP3, FLAC, WAV, Ogg, M4A, AAC and AIFF files and shows its report in the result dialog, with a downloadable HTML copy: `src/handlers/audioCheck.ts`, `src/handlers/audiocheck/` (copied from audiocheck, MIT), `src/ui/components/AudioReport/`, with tests in `test/handlers/audiocheck.test.ts` and `test/commonFormats.test.ts`. Dependencies: `music-metadata`, `fft.js`, `loudness-worklet` and `@noble/hashes`.
- Audio settings for evening out loudness, fading in and out, mixing to mono, playing backwards, cutting silence and changing speed, applied by FFmpeg: `src/ConversionSettings.ts` (`ffmpegAudioFilter`), `src/handlers/FFmpeg.ts`, `src/handlers/mediabunny.ts`.
- PDF settings for opening a protected PDF, protecting one with a password, page numbers and a watermark, and a "Combine into one PDF" tool for pictures: `src/handlers/pdfTools.ts`, with tests in `test/handlers/pdfTools.test.ts`.
- A "Colours" setting that turns a PNG into a smaller palette image with ImageMagick and OxiPNG: `src/handlers/ImageMagick.ts`, `src/handlers/canvasToBlob.ts`. The Compress summary gives the sizes before and after.
- "Contact sheet" and "Make a video" tools: `src/handlers/videoTools.ts`.
- Format definitions for MOV, MKV, WebM, AVI, M4A, AAC and AIFF, and the `AUDIO_FILES` list: `src/Formats.ts`.

#### Fixed

- MP4, MOV and MKV output no longer waits twenty seconds on a computer with ten or more cores: the filters of the multithreaded FFmpeg get four threads at most (`src/handlers/FFmpeg.ts`).
- WebM output from FFmpeg, which crashed in its VP9 encoder, is written as VP8 (`src/handlers/FFmpeg.ts`).
- The log of a running conversion draws its last 300 lines and not all of them for every new line, which made a conversion that tries many routes take three times as long (`src/ui/components/ConversionLogs/index.tsx`).
- A file-type icon bundle that failed to load is requested again, where no icon used to show until the page was reloaded (`src/ui/components/FileIcon/index.tsx`).

- A file that was removed from the selection can be added again.
- A single download no longer takes the type of another file whose conversion failed.
- Removing the first file no longer clears the output settings and the zip password.
- The button that adds files works from the keyboard.

#### Changed

- Files dropped or pasted onto an open selection are added to it. They used to replace it.
- The first FFmpeg conversion skips format discovery when the format cache has the formats (`src/handlers/FFmpeg.ts`, `src/Converter.ts`, `src/FormatHandler.ts`), and the development server serves `dist/cache.json` (`vite.config.js`).
- The target logic of the conversion page moved to `src/batch.ts`.
- `.github/workflows/pages.yml` gives write permissions to the deploy job only, both Bun workflows pin Bun 1.3.8, and the desktop build has the app id `com.gitguy268.convert`.
- Background removal uses the `silueta` model (44 MB) in place of `u2netp` (4.6 MB): `recipe/requirements.config.ts`, `src/handlers/removeBg.ts`.
- The glass action bar bends the format list before it frosts it, with less blur and tint, so that the bend can be seen: `src/ui/glass.css`, `src/ui/pages/Conversion/index.css`, `src/ui/index.tsx`.
- ImageMagick formats without a registered MIME type are offered, camera raw among them: `src/handlers/ImageMagick.ts`.
- A conversion keeps running while its tab is in the background, except presentation rendering and HTML to SVG, which draw with the page: `src/Converter.ts`, `src/main.ts`.
- The development server and the Docker image send the cross-origin isolation headers, and other hosts get them from a service worker: `vite.config.js`, `docker/nginx/default.conf`, `index.html`. FFmpeg, ONNX Runtime and OxiPNG use threads when they can: `src/handlers/FFmpeg.ts`, `src/handlers/removeBg.ts`, `src/common/index.ts`.
- The build system unpacks `.tgz` archives: `scripts/build/assemble.ts`.
- New format definitions: `src/Formats.ts`.
- A failed conversion names the error of the first route it tried: `src/ui/pages/Conversion/index.tsx`, `src/ui/ProgressStore.ts`, `src/main.ts`.
- `@xmldom/xmldom` is held at 0.8.15 for every package (`overrides` in `package.json`, `bun.lock`), because `epubjs` asks for 0.7, which has known vulnerabilities and no fixed release.
- For these additions, also: `src/ConversionSettings.ts`, `src/handlers/FFmpeg.ts`, `src/handlers/index.ts`, `src/main.ts`, `src/ui/components/ConversionSettings/index.tsx`, `src/ui/pages/Conversion/index.tsx`, `test/ConversionSettings.test.ts`, `vite.config.js`, `package.json`, `bun.lock`, `NOTICE` and `README.md`.

- The handlers and pages that pass those settings through: `src/Converter.ts`, `src/main.ts`, `src/common/canvas.ts`, `src/global.d.ts`, `src/handlers/FFmpeg.ts`, `src/handlers/ImageMagick.ts`, `src/handlers/canvasToBlob.ts`, `src/handlers/mediabunny.ts`, `src/ui/ProgressStore.ts`, `src/ui/components/FullPageDropOverlay/index.tsx`, `src/ui/pages/Conversion/index.tsx`, `src/ui/pages/Upload/index.tsx`, `test/commonFormats.test.ts`, `index.html`, `README.md` and `.gitignore`.
- For the additions of 2026-10-11: `src/handlers/index.ts`, `src/ui/components/FileInfo/`, `src/ui/pages/Conversion/index.css`, `vite.config.js`, `recipe/requirements.config.ts`, `package.json`, `bun.lock` and `NOTICE`, next to the files already listed above.
