import type { RequirementsConfig } from "../scripts/build";

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
    url: "https://github.com/TheZipCreator/espeakng.js/archive/d889d8b9cb07af4e3edb23e41a88adc1c9918414.tar.gz",
    hash: ["sha256", "958a6391d22464505a156a140fd8d6a6a8e8ca252d469dfb92c72676bb99b801"],
  },
  {
    name: "rpgmvp-decrypter",
    url: "https://github.com/ConnorTippets/RPG-Maker-MV-Decrypter/archive/82ccd8c4e1efcd051ab55ad618c320777c77b350.tar.gz",
    hash: ["sha256", "a3add518fe9b0030541af7cf01bef8ea45ed216316f63ffd9e64fd78faadb1a4"],
  },
  {
    name: "terraria-wld-parser",
    url: "https://github.com/ConnorTippets/terraria-world-file-ts/archive/e0400bfd5ab855e63185f94f892485faff3249d4.tar.gz",
    hash: ["sha256", "74f5646f6953a887c914dda11df1cd959203a71f49c3e253d29e7c5b82453265"],
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
    patches: ["make-esm.patch"],
  },
  {
    name: "typst-assets",
    url: "https://github.com/typst/typst-assets/archive/ad8080d46d42fca909562572cfa14a86f00eb945.tar.gz",
    hash: ["sha256", "4988f3ddf26b1feea9f312f9a2194493ed042aebf21eb18cc39452f24d261ced"],
  },
] satisfies RequirementsConfig;
