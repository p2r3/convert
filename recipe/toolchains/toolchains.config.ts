import type { ToolchainsConfig } from "../../scripts/build/types";

export default [
  {
    name: "node",
    version: "24.19.0-1",
    url: "https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz",
    hash: ["sha256", "14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647"],
  },
  {
    name: "typescript",
    version: "7.0.2-1",
    url: "https://registry.npmjs.org/@typescript/typescript-linux-x64/-/typescript-linux-x64-7.0.2.tgz",
    hash: ["sha256", "7ecad6f67377e831856367ab062ef394f21506a611405bf8ac0ff039348637d3"],
  },
  {
    name: "emscripten",
    version: "6.0.10-1",
    url: "https://storage.googleapis.com/webassembly/emscripten-releases-builds/linux/666337b525e673e769121856d175f6f52b8ead64/wasm-binaries.tar.xz",
    hash: ["sha256", "a51dd2829bdf725d268974728e032533b106ea01cb482a62288ec12627a7abbe"],
    toolchains: ["node", "typescript"],
  },
  {
    name: "bun",
    version: "1.4.2-1",
    url: "https://github.com/oven-sh/bun/releases/download/bun-v1.4.2/bun-linux-x64.zip",
    hash: ["sha256", "36368faef7527875d5ffa52e53cd48021741f2a83eb6208a8dd64068d422a913"],
  },
  {
    name: "ninja",
    version: "1.13.2-1",
    url: "https://github.com/ninja-build/ninja/releases/download/v1.13.2/ninja-linux.zip",
    hash: ["sha256", "5749cbc4e668273514150a80e387a957f933c6ed3f5f11e03fb30955e2bbead6"],
  },
  {
    name: "meson",
    version: "1.12.1-1",
    url: "https://github.com/mesonbuild/meson/releases/download/1.12.1/meson-1.12.1.tar.gz",
    hash: ["sha256", "ab0a6ca09f8ef70c564c8241fb5a23957886a0b53fb58412b5e07eaf07dba743"],
    toolchains: ["ninja"],
  },
  {
    name: "pkgconf",
    version: "3.0.7-1",
    url: "https://distfiles.ariadne.space/pkgconf/pkgconf-3.0.7.tar.xz",
    hash: ["sha256", "c926ff491cbd9a331a589160811bd97ab1749b4d5198a519338f2cdfabe6940a"],
    prebuild: "build.sh",
  },
  {
    name: "llvm-mingw",
    version: "20261020-1",
    url: "https://github.com/mstorsjo/llvm-mingw/releases/download/20261020/llvm-mingw-20261020-ucrt-ubuntu-22.04-x86_64.tar.xz",
    hash: ["sha256", "55064b60b991a1e1e8090b8c2f84e82b22cfe5903d12c159d65064cf5e8ae335"],
  },
] satisfies ToolchainsConfig;
