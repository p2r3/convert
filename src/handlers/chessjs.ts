// file: chessjs.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import { Chess } from 'chess.js';

class chessjsHandler implements FormatHandler {

  public name: string = "chessjs";
  public supportedFormats: FileFormat[] = [
    {
      name: "Forsyth–Edwards Notation",
      format: "fen",
      extension: "fen",
      mime: "application/vnd.chess-fen",
      from: true,
      to: true,
      internal: "fen",
      category: Category.TEXT,
      lossless: false
    },
    {
      name: "Portable Game Notation",
      format: "pgn",
      extension: "pgn",
      mime: "application/vnd.chess-pgn",
      from: true,
      to: true,
      internal: "pgn",
      category: Category.TEXT,
      lossless: true
    },
    CommonFormats.TEXT.builder("txt").allowTo().markLossless(false),
  ];
  public ready: boolean = false;

  async init () {
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const inputFile of inputFiles) {
      const chess = new Chess();

      const input = new TextDecoder().decode(inputFile.bytes).trim();
      if (inputFormat.internal === "fen") {
        chess.load(input, { skipValidation: true });
      } else if (inputFormat.internal === "pgn") {
        chess.loadPgn(input);
      } else {
        throw new Error(`chessjsHandler cannot convert from ${inputFormat.mime}`);
      }

      let output;
      if (outputFormat.internal === "fen") {
        output = chess.fen();
      } else if (outputFormat.internal === "pgn") {
        output = chess.pgn();
      } else if (outputFormat.internal === "txt") {
        output = chess.ascii();
      } else {
        throw new Error(`chessjsHandler cannot convert to ${outputFormat.mime}`);
      }

      const bytes = new TextEncoder().encode(output);
      const name = inputFile.name.replace(/\.[^.]+$/, "") + `.${outputFormat.extension}`;
      outputFiles.push({ name, bytes });
    }
    return outputFiles;
  }

}

export default chessjsHandler;