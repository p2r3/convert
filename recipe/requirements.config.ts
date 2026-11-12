import type { RequirementsConfig } from "../scripts/build/types";

export default [
  {
    name: "envelope",
    url: "https://github.com/p2r3/envelope/archive/2d8bc87d948ccfc391e86724bb0a5d7b1689d5c6.tar.gz",
    hash: ["sha256", "913bf08c8c058870809ed5b142c7859c63eba0e147cd6807a6f1078053c92778"],
  },
  {
    name: "qoi-fu",
    url: "https://github.com/pfusik/qoi-fu/archive/2fab2661f2b72fe73643a8ed7be782bd1053f6a2.tar.gz",
    hash: ["sha256", "121821e657d3ca2b1553260516089f7efc7097a539b6e8ba73b3ed3f801eebf9"],
  },
  {
    name: "sppd",
    url: "https://github.com/p2r3/sppd/archive/a9d61795b5b3f2c6d06eda09ea3b31bf239e0498.tar.gz",
    hash: ["sha256", "0fc79a67fd285bcae5b73f55b140a28d10e7d7a74db56bad233b2e5b6deb6014"],
  },
  {
    name: "qoa-fu",
    url: "https://github.com/pfusik/qoa-fu/archive/70679a2d6223e25e37d7b421b2a14cd4e7d2b5b5.tar.gz",
    hash: ["sha256", "ec9349087d770689bc978fa4e520906814b07e6ce1a3c50e7a25272db3542a49"],
  },
  {
    name: "image-to-txt",
    url: "https://github.com/zipsegv/image-to-txt/archive/759fcf98a3ba1d079dd73fcce84adf396156548d.tar.gz",
    hash: ["sha256", "8acba29a08aab6171c42c5155358c3c44a343ea066dee1d3c8a719e069b86a9b"],
  },
  {
    name: "espeakng.js",
    url: "https://github.com/steveseguin/espeakng.js/archive/46a04afb1425209f6d6f7e50ac389ae24f41b821.tar.gz",
    hash: ["sha256", "47ea2838f9befa3bf5d26024aca344e62439d7c25210686e0d5a57edd834b361"],
    patches: ["esm.patch"],
    copy: {
      "espeakng-simple.d.ts": "js/espeakng-simple.d.ts",
    },
  },
  {
    name: "rpgmvp-decrypter",
    url: "https://github.com/Petschko/RPG-Maker-MV-Decrypter/archive/d2ae9b8c2c87d51eb5643180efb74bddf611e829.tar.gz",
    hash: ["sha256", "d1fc516b1b05d085fd7657c0b5913b092e492b38265e734a9edabcf63014ac25"],
    patches: ["export.patch"],
    copy: {
      "Decrypter.d.ts": "scripts/Decrypter.d.ts",
    },
  },
  {
    name: "terraria-wld-parser",
    url: "https://github.com/TEdit/terraria-world-file-ts/archive/7292cb8509d2aa869583cf9f8549d6f78f7f9a24.tar.gz",
    hash: ["sha256", "f0fcc7704d32b87f0e980d7298801bddf1c828a0a8a47d4a511c6f88525b0479"],
    patches: ["fixes.patch"],
    prebuild: "build.sh",
  },
  {
    name: "gimper",
    url: "https://github.com/ConnorTippets/gimper/archive/55b5be50f83fd20e353337e7f1df1d3fec25afc7.tar.gz",
    hash: ["sha256", "05e202757899709feeda03a2b02875446d0fcd30ea3f504f8daa0ebce50c2186"],
  },
  {
    name: "turbowarp-unpackager",
    url: "https://github.com/TurboWarp/unpackager/archive/9a8dd22a7095cf7275107a0f6ef113f74b16a505.tar.gz",
    hash: ["sha256", "b11c47d69c7b4349ff991b70fa429fd60f1193aa6e8db073f5ed616f8571999f"],
  },
  {
    name: "typst-assets",
    url: "https://github.com/typst/typst-assets/archive/94dcb990edb36311ef85162baa26e4a8205e0bf0.tar.gz",
    hash: ["sha256", "2c13595a732095045a0bdcc108767237c4809e4b3519dc1645dc264e0b84bfef"],
  },
  {
    name: "pandoc",
    url: "https://github.com/jgm/pandoc/releases/download/3.13/pandoc-3.13-wasm.zip",
    hash: ["sha256", "234d2020a7f3a9aab387bd35df3c17ca2ba0078a82490e2b3ede890d648d64fe"],
  },
  {
    name: "pandoc-js",
    url: "https://raw.githubusercontent.com/jgm/pandoc/3.13/wasm/pandoc.js",
    hash: ["sha256", "6b07bca137feee170bffa2aefd0e5e067135a86a0b8aa4ec6da31049e6c5a36b"],
    patches: ["vite-and-extract-media.patch"],
  },
  {
    name: "foliate-mobi",
    url: "https://raw.githubusercontent.com/johnfactotum/foliate-js/9a676796f728347b0127162079c13d23a0f7fee8/mobi.js",
    hash: ["sha256", "016526df13a9f11ee6671a8c74346e1cf41fe6bdfe50165fdcbf744f015694f3"],
    patches: ["linkedom.patch"],
  },
  {
    name: "timgm6mb",
    url: "https://deb.debian.org/debian/pool/main/t/timgm6mb-soundfont/timgm6mb-soundfont_1.3.orig.tar.gz",
    hash: ["sha256", "af8f3a00e416dfb262bcaa904a1c84df04a51b72bbc1313aed012bc754bdf99b"],
  },
  {
    name: "material-icons",
    url: "https://github.com/material-extensions/vscode-material-icon-theme/archive/f368264282ef14ee7feb012fd54e825181eff9c3.tar.gz",
    hash: ["sha256", "e5a830c2cd1315f43361a773a16c1728262651f87746da3a9faa76d160dbc832"],
    assemble: "assemble.ts",
  },
  {
    name: "shtoelf",
    prebuild: "build.sh",
  },
  {
    name: "battoexe",
    prebuild: "build.sh",
    toolchains: ["llvm-mingw"],
  },
  {
    name: "libopenmpt",
    url: "https://lib.openmpt.org/files/libopenmpt/src/libopenmpt-0.8.9+release.makefile.tar.gz",
    hash: ["sha256", "9273b88b67973cc69e54d748ab1b749399d6d07695f1c37d0c59f88b4106074f"],
    prebuild: "build.sh",
    toolchains: ["emscripten"],
  },
  {
    name: "turbowarp-packager",
    url: "https://github.com/TurboWarp/packager/archive/9a4854b238c5ebfe9ccbbda486382a673c85cd38.tar.gz",
    hash: ["sha256", "95bebe471a9c7316961526f230ef23d4bd0a37901eb063c543e859c5e35823c6"],
    patches: ["browser.patch"],
    copy: {
      "bun.lock": "bun.lock",
    },
    prebuild: "build.sh",
    toolchains: ["bun"],
    allowNetwork: true,
  },
  {
    name: "7z",
    url: "https://github.com/ip7z/7zip/releases/download/26.05/7z2605-src.tar.xz",
    hash: ["sha256", "0b6080b8c3e7a579161d2d495224c0e51c467576cb4c7048b0ab485ef44cc22e"],
    patches: ["emcc.patch"],
    prebuild: "build.sh",
    toolchains: ["emscripten"],
  },
  {
    name: "ffmpeg",
    url: "https://github.com/FFmpeg/FFmpeg/archive/refs/tags/n9.0.2.tar.gz",
    hash: ["sha256", "6e374ed621e48faa40639307dff48ba6fe574a509977956d2cce9669b7cc27e9"],
    patches: ["make.patch", "allmuxers.patch", "muxercodecs.patch"],
    prebuild: "build.sh",
    toolchains: ["emscripten", "meson", "pkgconf"],
  },
  {
    name: "clang",
    optional: true,
    url: "https://github.com/llvm/llvm-project/releases/download/llvmorg-23.1.2/llvm-project-23.1.2.src.tar.xz",
    hash: ["sha256", "c98bbef08a2b4c2613cd50e9aa9ae7b69b1fe6c16b2c40373bc0ab6116fdf78a"],
    patches: ["libcxx-wasi.patch"],
    prebuild: "build.sh",
    toolchains: ["emscripten", "ninja"],
  },
] satisfies RequirementsConfig;
