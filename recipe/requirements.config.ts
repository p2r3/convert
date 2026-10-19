import type { RequirementsConfig } from "../scripts/build/types";

export default [
  {
    name: "envelope",
    url: "https://github.com/p2r3/envelope/archive/2d8bc87d948ccfc391e86724bb0a5d7b1689d5c6.tar.gz",
    hash: ["sha256", "913bf08c8c058870809ed5b142c7859c63eba0e147cd6807a6f1078053c92778"],
  },
  {
    name: "qoi-fu",
    url: "https://github.com/pfusik/qoi-fu/archive/d4e5af8d3f3bed953f68dfc9c569690823888140.tar.gz",
    hash: ["sha256", "6bd7a1a2ed401361e527b57af209ccafe2ec93ed7827f64b26721b699121ce8d"],
  },
  {
    name: "sppd",
    url: "https://github.com/p2r3/sppd/archive/a9d61795b5b3f2c6d06eda09ea3b31bf239e0498.tar.gz",
    hash: ["sha256", "0fc79a67fd285bcae5b73f55b140a28d10e7d7a74db56bad233b2e5b6deb6014"],
  },
  {
    name: "qoa-fu",
    url: "https://github.com/pfusik/qoa-fu/archive/521424aec645666d49cac7935b9d2f03354d92e6.tar.gz",
    hash: ["sha256", "0b5a34da308743fb046e0537d97a851412591c5a90562513062ccdc1e6928803"],
  },
  {
    name: "image-to-txt",
    url: "https://github.com/zipsegv/image-to-txt/archive/477f5dcd3a699119f471ffeb334bb77795bc3bdd.tar.gz",
    hash: ["sha256", "7b956242110782d1c69653766b525d9db8e6d757dcc509784f5480906087936e"],
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
  },
  {
    name: "gimper",
    url: "https://github.com/ConnorTippets/gimper/archive/55b5be50f83fd20e353337e7f1df1d3fec25afc7.tar.gz",
    hash: ["sha256", "05e202757899709feeda03a2b02875446d0fcd30ea3f504f8daa0ebce50c2186"],
  },
  {
    name: "turbowarp-unpackager",
    url: "https://github.com/TurboWarp/unpackager/archive/2eb03bd5dc18e3b7b1318190bef8e14274123778.tar.gz",
    hash: ["sha256", "3bb10d2d3cf90496ddca29b523da85a901040d707ac03751de40edd35c8d61ce"],
  },
  {
    name: "typst-assets",
    url: "https://github.com/typst/typst-assets/archive/ad8080d46d42fca909562572cfa14a86f00eb945.tar.gz",
    hash: ["sha256", "4988f3ddf26b1feea9f312f9a2194493ed042aebf21eb18cc39452f24d261ced"],
  },
  {
    name: "pandoc",
    url: "https://github.com/jgm/pandoc/releases/download/3.11/pandoc-3.11.wasm.zip",
    hash: ["sha256", "bd856c19094f5333ee92f239dd93d288a05429f1d957efef1c37e7bb97ac14bd"],
  },
  {
    name: "pandoc-js",
    url: "https://raw.githubusercontent.com/jgm/pandoc/3.11/wasm/pandoc.js",
    hash: ["sha256", "6b07bca137feee170bffa2aefd0e5e067135a86a0b8aa4ec6da31049e6c5a36b"],
    patches: ["vite-and-extract-media.patch"],
  },
  {
    name: "foliate-mobi",
    url: "https://raw.githubusercontent.com/johnfactotum/foliate-js/399248a67a8862ffb5e6463a33f9d52b317ca2eb/mobi.js",
    hash: ["sha256", "833a25b0d6e7079027bfef9c28a3da702f093a50bd3f465945bc0d9fd0cd75cf"],
    patches: ["linkedom.patch"],
  },
  {
    name: "timgm6mb",
    url: "https://deb.debian.org/debian/pool/main/t/timgm6mb-soundfont/timgm6mb-soundfont_1.3.orig.tar.gz",
    hash: ["sha256", "af8f3a00e416dfb262bcaa904a1c84df04a51b72bbc1313aed012bc754bdf99b"],
  },
  {
    name: "material-icons",
    url: "https://github.com/material-extensions/vscode-material-icon-theme/archive/cb1dfb6d9cb73b15681a93939983d75dbba7bf5b.tar.gz",
    hash: ["sha256", "fcf933b7b9fe2a8b54366abc6c88d0c902f8846eb436074d151e7a135c13c444"],
    assemble: "assemble.ts",
  },
  {
    name: "shtoelf",
    prebuild: "build.sh",
    image:
      "gcc:15-bookworm@sha256:9ca91b05c7b07d2979f16413e8b2cd6ec8a7c80ffca4121ccab0aeba33f90460",
  },
  {
    name: "libopenmpt",
    url: "https://lib.openmpt.org/files/libopenmpt/src/libopenmpt-0.8.9+release.makefile.tar.gz",
    hash: ["sha256", "9273b88b67973cc69e54d748ab1b749399d6d07695f1c37d0c59f88b4106074f"],
    prebuild: "build.sh",
    image:
      "emscripten/emsdk:6.0.10@sha256:e077d54e2b8970575ebc4f185ac1de0b95c05f2b266134d4ba27449af7aebf65",
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
    image:
      "oven/bun:latest@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895",
    allowNetwork: true,
  },
  {
    name: "7z",
    url: "https://github.com/ip7z/7zip/releases/download/26.03/7z2603-src.tar.xz",
    hash: ["sha256", "9cbde5099c6deb73691b0579063da5827522ccbbcba3f0020fd04e8c8c16c0d4"],
    patches: ["emcc.patch"],
    prebuild: "build.sh",
    image:
      "emscripten/emsdk:6.0.10@sha256:e077d54e2b8970575ebc4f185ac1de0b95c05f2b266134d4ba27449af7aebf65",
  },
  {
    name: "silueta",
    url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx",
    hash: ["sha256", "75da6c8d2f8096ec743d071951be73b4a8bc7b3e51d9a6625d63644f90ffeedb"],
  },
  {
    name: "liquid-glass-ui",
    url: "https://github.com/hwyuanzi/LiquidGlass-UI/archive/293328c3a983b55460b488bffb2caa6f25729c2f.tar.gz",
    hash: ["sha256", "f49c27196a5197414be60c5a572ab1bbda72018ab14681da36c76239e218542f"],
  },
  {
    // from SheetJS's own server: the "xlsx" package on npm stopped at 0.18.5, which has known holes
    name: "sheetjs",
    url: "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
    hash: ["sha256", "8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8"],
    copy: {
      "xlsx.d.mts": "xlsx.d.mts",
    },
  },
] satisfies RequirementsConfig;
