import { stripHandler, type FormatHandler, type HandlerDefinition } from "../FormatHandler.ts";

// add your handler's name into this object, it will resolve the file and the default export
// cola: []
// (imports default from cola.ts)
// or you might need to help it by something like this
// pepsiCola: ["./cola.ts", "pepsiColaHandler"]
// (import pepsiColaHandler named "pepsiCola" from cola.ts)
const HANDLERS = {
  epub: [],
  pandoc: [],
  typst: [],
  pptxRenderer: [],
  svgTrace: [],
  canvasToBlob: [],
  svgToBlob: [],
  meyda: [],
  htmlEmbed: [],
  mediabunny: [],
  ImageMagick: [],
  curani: [],
  bunburrows: [],
  rgba: [],
  comicsZipPacker: ["./comics.ts", "comicsZipPackerHandler"],
  comicsZipUnpacker: ["./comics.ts", "comicsZipUnpackerHandler"],
  comicsTarUnpacker: ["./comics.ts", "comicsTarUnpackerHandler"],
  FFmpeg: [],
  renameZip: ["./rename.ts", "renameZipHandler"],
  renameTar: ["./rename.ts", "renameTarHandler"],
  renameRar: ["./rename.ts", "renameRarHandler"],
  rename7z: ["./rename.ts", "rename7zHandler"],
  renameTxt: ["./rename.ts", "renameTxtHandler"],
  renameJson: ["./rename.ts", "renameJsonHandler"],
  envelope: [],
  htmlToSvg: [],
  qoiFu: [],
  sppd: [],
  threejs: [],
  sqlite: [],
  vtf: [],
  mcMap: [],
  sevenZip: [],
  config: [],
  als: [],
  qoaFu: [],
  pyTurtle: [],
  fromJson: ["./json.ts", "fromJsonHandler"],
  toJson: ["./json.ts", "toJsonHandler"],
  nbt: [],
  peToZip: [],
  flpToJson: [],
  flo: [],
  cgbiToPng: [],
  batToExe: [],
  turbowarp: [],
  textEncoding: [],
  jsonToC: [],
  libopenmpt: [],
  midiCodec: ["./midi.ts", "midiCodecHandler"],
  midiSynth: ["./midi.ts", "midiSynthHandler"],
  lzh: ["./lzh.ts", "lzhHandler"],
  lzh2: ["./lzh.ts", "lzh2Handler"],
  wad: [],
  txtToInfiniteCraft: ["./infiniteCraft.ts", "txtToInfiniteCraftHandler"],
  infiniteCraftToJson: ["./infiniteCraft.ts", "infiniteCraftToJsonHandler"],
  espeakng: [],
  exeToBat: [],
  bsor: [],
  font: [],
  icns: [],
  mcSchematic: [],
  bson: [],
  aseprite: [],
  har: [],
  n64rom: [],
  vexFlow: [],
  toon: [],
  rpgmvp: [],
  ota: [],
  terrariaWld: [],
  opusMagnumMain: ["./opusMagnum.ts", "opusMagnumMainHandler"],
  opusMagnumTTM: ["./opusMagnum.ts", "opusMagnumTTMHandler"],
  opusMagnumITM: ["./opusMagnum.ts", "opusMagnumITMHandler"],
  aperturePicture: [],
  xcf: [],
  textToPdf: [],
  pdfjs: [],
  mupdf: [],
  pdfparse: [],
  minecraftLang: [],
  celariaMap: [],
  cybergrind: [],
  textToSource: [],
  wabt: [],
  chessjs: [],
  fenToJson: [],
  piskel: [],
  xcursor: [],
  shToElf: [],
  css: [],
  bbmodel: [],
  kra: [],
  krz: [],
  brarchive: [],
  wasiRunner: [],
  clangWasi: [],
  mcModpack: [],
  azw3: [],
  wavebreak: [],
  emf: [],
} as const;

// handlers can only be named things listed above
export type HandlerName = keyof typeof HANDLERS;

const HANDLER_NAMES = Object.keys(HANDLERS) as HandlerName[];

type HandlerModule = Partial<
  Record<
    Exclude<
      (typeof HANDLERS)[keyof typeof HANDLERS],
      readonly []
    >[1] | "default",
    new () => FormatHandler
  >
>;

const modules = import.meta.glob<HandlerModule>("./*.ts");

const singletons = new Map<HandlerName, Promise<FormatHandler>>();

export async function getHandler(name: HandlerName) {
  let promise = singletons.get(name);
  if (promise) return promise;

  promise = (async () => {
    const handlerEntry = HANDLERS[name];
    if (!handlerEntry) throw new Error(`Handler ${name} was not found!`);

    const [modulePath = `./${name}.ts`, exportName = "default"] = handlerEntry;

    const module = modules[modulePath];
    const HandlerClass = (await module())[exportName];
    if (!HandlerClass) throw new Error(`Handler ${modulePath} did not have an export ${exportName}!`);

    const handler = new HandlerClass();
    return handler;
  })();
  promise.catch(() => singletons.delete(name));

  singletons.set(name, promise);
  return promise;
}

export async function ensureDefinitions(cache: HandlerDefinition[]) {
  for (let i = cache.length - 1; i >= 0; i--) {
    if (HANDLER_NAMES.includes(cache[i].name)) continue;
    console.error(`Handler "${cache[i].name}" doesnt exist but is in the format cache?!`);
    cache.splice(i, 1);
  }

  await Promise.all(HANDLER_NAMES.map(async handlerName => {
    if (cache.some(h => h.name === handlerName)) return;

    console.warn(`Cache miss for handler "${handlerName}"`);

    try {
      const handler = await getHandler(handlerName);
      if (handler.name !== handlerName)
        throw new Error(`Handler ${handlerName} reported ${handler.name} as their name?!`);
      await handler.init();
      cache.push(stripHandler(handler));
      console.log(`Updated handler cache for handler "${handlerName}".`);
    } catch (error) {
      console.error(`Error while initializing ${handlerName}:`, error);
    }
  }));
  cache.sort((a, b) => HANDLER_NAMES.indexOf(a.name) - HANDLER_NAMES.indexOf(b.name));
}
