# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changes in this fork

This repository is a fork of [p2r3/convert](https://github.com/p2r3/convert). The files below were changed or added by Lucas Van De Weerd on 2026-10-10 and 2026-10-11 and are, like the rest of the project, licensed under the GNU General Public License, version 2.

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

#### Changed

- The handlers and pages that pass those settings through: `src/Converter.ts`, `src/main.ts`, `src/common/canvas.ts`, `src/global.d.ts`, `src/handlers/FFmpeg.ts`, `src/handlers/ImageMagick.ts`, `src/handlers/canvasToBlob.ts`, `src/handlers/mediabunny.ts`, `src/ui/ProgressStore.ts`, `src/ui/components/FullPageDropOverlay/index.tsx`, `src/ui/pages/Conversion/index.tsx`, `src/ui/pages/Upload/index.tsx`, `test/commonFormats.test.ts`, `index.html`, `README.md` and `.gitignore`.
- For the additions of 2026-10-11: `src/handlers/index.ts`, `src/ui/components/FileInfo/`, `src/ui/pages/Conversion/index.css`, `vite.config.js`, `recipe/requirements.config.ts`, `package.json`, `bun.lock` and `NOTICE`, next to the files already listed above.
