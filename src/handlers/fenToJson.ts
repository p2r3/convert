// file: fenToJson.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import { BLACK, KING, QUEEN, SQUARES, WHITE, type Color, type PieceSymbol, type Square } from 'chess.js';

// same as .board() on chess.js
type BoardSquare = {
  square: Square;
  type: PieceSymbol;
  color: Color;
} | null;

type Game = {
  board: BoardSquare[][],
  turn: Color,
  castling: {
    [WHITE]: {
      [KING]: boolean;
      [QUEEN]: boolean;
    },
    [BLACK]: {
      [KING]: boolean;
      [QUEEN]: boolean;
    },
  },
  epSquare: Square | null,
  halfMoves: number,
  moveNumber: number,
};

function isSquare(value: string): value is Square { // ts is cool
  return (SQUARES as string[]).includes(value);
}

function isPieceSymbol(value: string): value is PieceSymbol {
  return "pnbrqk".includes(value);
}

class fenToJsonHandler implements FormatHandler {

  public name: string = "fenToJson";
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
      lossless: true
    },
    CommonFormats.JSON.builder("json").allowTo().allowFrom().markLossless(),
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
      const input = new TextDecoder().decode(inputFile.bytes).trim();
      let output;
      if (inputFormat.internal === "fen") {
        const [boardFen, turn, castling, epSquare, halfMoves, moveNumber] = input.split(" ");

        let board: BoardSquare[][] = [];
        let currentSquare = 0;
        for (const rowFen of boardFen.split("/")) {
          const row: BoardSquare[] = [];

          for (const char of rowFen) {
            if (char >= '0' && char <= '9') {
              row.push(...Array(Number(char)).fill(null));
              currentSquare += Number(char);
            } else {
              const type = char.toLowerCase();
              row.push({
                square: SQUARES[currentSquare],
                color: char >= 'A' && char <= 'Z' ? WHITE : BLACK,
                type: isPieceSymbol(type) ? type : 'p'
              });
              currentSquare += 1;
            }
          }
          
          board.push(row);
        }
        
        const game: Game = {
          board,
          turn: turn === 'w' ? WHITE : BLACK,
          castling: {
            [WHITE]: {
              [KING]: castling.includes('K'),
              [QUEEN]: castling.includes('Q'),
            },
            [BLACK]: {
              [KING]: castling.includes('k'),
              [QUEEN]: castling.includes('q'),
            },
          },
          epSquare: isSquare(epSquare) ? epSquare : null,
          halfMoves: Number(halfMoves),
          moveNumber: Number(moveNumber)
        };
        output = JSON.stringify(game);
      } else if (inputFormat.internal === "json") {
        const game: Game = JSON.parse(input); 
        let fen: string[] = [];

        let boardFen: string[] = [];
        for (const row of game.board) {
          let rowFen = [];
          let emptyCounter = 0;
          for (const square of row) {
            if (!square) {
              emptyCounter++;
              continue;
            }

            if (emptyCounter > 0) {
              rowFen.push(String(emptyCounter));
              emptyCounter = 0;
            }

            rowFen.push(
              square.color === WHITE 
                ? square.type.toUpperCase() 
                : square.type.toLowerCase()
            );
          }
          if (emptyCounter > 0) {
            rowFen.push(String(emptyCounter));
          }
          boardFen.push(rowFen.join(''));
        }
        fen.push(boardFen.join('/'));

        fen.push(game.turn);
        const castling = 
          (game.castling[WHITE][KING] ? 'K' : '')
        + (game.castling[WHITE][QUEEN] ? 'Q' : '')
        + (game.castling[BLACK][KING] ? 'k' : '')
        + (game.castling[BLACK][QUEEN] ? 'q' : '');
        fen.push(castling !== '' ? castling : '-');
        fen.push(game.epSquare ?? '-');
        fen.push(String(game.halfMoves));
        fen.push(String(game.moveNumber));

        output = fen.join(' ');
      }
      const bytes = new TextEncoder().encode(output);
      const name = inputFile.name.replace(/\.[^.]+$/, "") + `.${outputFormat.extension}`;
      outputFiles.push({ name, bytes });
    }
    return outputFiles;
  }

}

export default fenToJsonHandler;