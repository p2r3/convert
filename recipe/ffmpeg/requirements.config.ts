import type { RequirementsConfig } from "scripts/build/types";

// the libraries ffmpeg links against
export default [
  {
    name: "zlib",
    url: "https://github.com/madler/zlib/releases/download/v1.4/zlib-1.4.tar.gz",
    hash: ["sha256", "02dd159783677a749c04adbdd02b55b8a2bcc7e054f51b76b549199a916ad584"],
  },
  {
    name: "lame",
    url: "https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz",
    hash: ["sha256", "ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e"],
  },
  {
    name: "ogg",
    url: "https://downloads.xiph.org/releases/ogg/libogg-1.3.6.tar.gz",
    hash: ["sha256", "83e6704730683d004d20e21b8f7f55dcb3383cdf84c0daedf30bde175f774638"],
  },
  {
    name: "vorbis",
    url: "https://downloads.xiph.org/releases/vorbis/libvorbis-1.3.7.tar.gz",
    hash: ["sha256", "0e982409a9c3fc82ee06e08205b1355e5c6aa4c36bca58146ef399621b0ce5ab"],
  },
  {
    name: "opus",
    url: "https://downloads.xiph.org/releases/opus/opus-1.6.1.tar.gz",
    hash: ["sha256", "6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1"],
  },
  {
    name: "theora",
    url: "https://downloads.xiph.org/releases/theora/libtheora-1.2.0.tar.gz",
    hash: ["sha256", "279327339903b544c28a92aeada7d0dcfd0397b59c2f368cc698ac56f515906e"],
  },
  {
    name: "speex",
    url: "https://downloads.xiph.org/releases/speex/speex-1.2.1.tar.gz",
    hash: ["sha256", "4b44d4f2b38a370a2d98a78329fefc56a0cf93d1c1be70029217baae6628feea"],
  },
  {
    name: "opencore-amr",
    url: "https://downloads.sourceforge.net/project/opencore-amr/opencore-amr/opencore-amr-0.1.6.tar.gz",
    hash: ["sha256", "483eb4061088e2b34b358e47540b5d495a96cd468e361050fae615b1809dc4a1"],
  },
  {
    name: "vo-amrwbenc",
    url: "https://downloads.sourceforge.net/project/opencore-amr/vo-amrwbenc/vo-amrwbenc-0.1.3.tar.gz",
    hash: ["sha256", "5652b391e0f0e296417b841b02987d3fd33e6c0af342c69542cbb016a71d9d4e"],
  },
  {
    name: "gsm",
    url: "https://www.quut.com/gsm/gsm-1.0.22.tar.gz",
    hash: ["sha256", "f0072e91f6bb85a878b2f6dbf4a0b7c850c4deb8049d554c65340b3bf69df0ac"],
  },
  {
    name: "ilbc",
    url: "https://github.com/TimothyGu/libilbc/releases/download/v3.0.4/libilbc-3.0.4.tar.gz",
    hash: ["sha256", "6820081a5fc58f86c119890f62cac53f957adb40d580761947a0871cea5e728f"],
  },
  {
    name: "codec2",
    url: "https://github.com/drowe67/codec2/archive/refs/tags/1.2.0.tar.gz",
    hash: ["sha256", "cbccae52b2c2ecc5d2757e407da567eb681241ff8dadce39d779a7219dbcf449"],
  },
  {
    name: "vpx",
    url: "https://github.com/webmproject/libvpx/archive/refs/tags/v1.17.0.tar.gz",
    hash: ["sha256", "1020f184046187baa2985dbde38e0691f49c44088bca7a1842b0236c6081dc0a"],
  },
  {
    name: "x264",
    url: "https://code.videolan.org/videolan/x264/-/archive/b35605ace3ddf7c1a5d67a2eb553f034aef41d55/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz",
    hash: ["sha256", "cd71a7515b0e9a012e1ac9b1f8415bebcaf6fc97d4db32286642ac4c0fbe24f9"],
  },
  {
    name: "x265",
    url: "https://bitbucket.org/multicoreware/x265_git/downloads/x265_4.2.tar.gz",
    hash: ["sha256", "40b1ea0453e0309f0eba934e0ddf533f8f6295966679e8894e8f1c1c8d5e1210"],
  },
  {
    name: "webp",
    url: "https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.6.0.tar.gz",
    hash: ["sha256", "e4ab7009bf0629fd11982d4c2aa83964cf244cffba7347ecd39019a9e38c4564"],
  },
  {
    name: "dav1d",
    url: "https://downloads.videolan.org/pub/videolan/dav1d/1.5.4/dav1d-1.5.4.tar.xz",
    hash: ["sha256", "686616b7c69eb88d44459391ab25cac13b6647a3b288835c5784e71c1514a5c5"],
  },
  {
    name: "aom",
    url: "https://storage.googleapis.com/aom-releases/libaom-3.15.3.tar.gz",
    hash: ["sha256", "12c01dc731ed7b5a999e28120b45bf58a002ba3435a4ba2cfbc1e084a27c9c04"],
  },
  {
    name: "vvenc",
    url: "https://github.com/fraunhoferhhi/vvenc/archive/refs/tags/v1.14.0.tar.gz",
    hash: ["sha256", "dd43d061d59dbc0d9b9ae5b99cb40672877dd811646228938f065798939ee174"],
  },
] satisfies RequirementsConfig;
