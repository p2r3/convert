import type { FormatHandler } from "../FormatHandler.ts";
import { handlerRegistry } from "../HandlerRegistry.ts";

import canvasToBlobHandler from "./canvasToBlob.ts";
import meydaHandler from "./meyda.ts";
import htmlEmbedHandler from "./htmlEmbed.ts";
import FFmpegHandler from "./FFmpeg.ts";
import pdftoimgHandler from "./pdftoimg.ts";
import ImageMagickHandler from "./ImageMagick.ts";
import svgTraceHandler from "./svgTrace.ts";
import { renameZipHandler, renameTxtHandler } from "./rename.ts";
import envelopeHandler from "./envelope.ts";
import pandocHandler from "./pandoc.ts";
import svgForeignObjectHandler from "./svgForeignObject.ts";
import qoiFuHandler from "./qoi-fu.ts";
import sppdHandler from "./sppd.ts";
import threejsHandler from "./threejs.ts";
import sqlite3Handler from "./sqlite.ts";
import vtfHandler from "./vtf.ts";
import mcMapHandler from "./mcmap.ts";
import jszipHandler from "./jszip.ts";
import qoaFuHandler from "./qoa-fu.ts";
import pyTurtleHandler from "./pyTurtle.ts";
import { fromJsonHandler, toJsonHandler } from "./json.ts";
import nbtHandler from "./nbt.ts";
import peToZipHandler from "./petozip.ts";
import flptojsonHandler from "./flptojson.ts";
import floHandler from "./flo.ts";
import cgbiToPngHandler from "./cgbi-to-png.ts";
import batToExeHandler from "./batToExe.ts";
import textEncodingHandler from "./textEncoding.ts";
import libopenmptHandler from "./libopenmpt.ts";
import lzhHandler from "./lzh.ts";

const handlers: FormatHandler[] = [];

// Register handlers with proper error tracking
// Handler initialization errors are now logged and observable via handlerRegistry

function tryRegisterHandler(handler: FormatHandler): void {
  if (handlerRegistry.register(handler)) {
    handlers.push(handler);
  }
}

tryRegisterHandler(new svgTraceHandler());
tryRegisterHandler(new canvasToBlobHandler());
tryRegisterHandler(new meydaHandler());
tryRegisterHandler(new htmlEmbedHandler());
tryRegisterHandler(new FFmpegHandler());
tryRegisterHandler(new pdftoimgHandler());
tryRegisterHandler(new ImageMagickHandler());
tryRegisterHandler(renameZipHandler);
tryRegisterHandler(renameTxtHandler);
tryRegisterHandler(new envelopeHandler());
tryRegisterHandler(new svgForeignObjectHandler());
tryRegisterHandler(new qoiFuHandler());
tryRegisterHandler(new sppdHandler());
tryRegisterHandler(new threejsHandler());
tryRegisterHandler(new sqlite3Handler());
tryRegisterHandler(new vtfHandler());
tryRegisterHandler(new mcMapHandler());
tryRegisterHandler(new jszipHandler());
tryRegisterHandler(new qoaFuHandler());
tryRegisterHandler(new pyTurtleHandler());
tryRegisterHandler(new fromJsonHandler());
tryRegisterHandler(new toJsonHandler());
tryRegisterHandler(new nbtHandler());
tryRegisterHandler(new peToZipHandler());
tryRegisterHandler(new flptojsonHandler());
tryRegisterHandler(new floHandler());
tryRegisterHandler(new cgbiToPngHandler());
tryRegisterHandler(new batToExeHandler());
tryRegisterHandler(new textEncodingHandler());
tryRegisterHandler(new libopenmptHandler());
tryRegisterHandler(new lzhHandler());
tryRegisterHandler(new pandocHandler());

// Log any handler initialization errors that occurred
const initErrors = handlerRegistry.getInitErrors();
if (initErrors.length > 0) {
  console.warn(`Handler initialization completed with ${initErrors.length} error(s):`);
  for (const err of initErrors) {
    console.warn(`  - ${err.handlerName}: ${err.error}`);
  }
}

export default handlers;
