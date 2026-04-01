import type { FileFormat, FileData, ConvertPathNode } from "./FormatHandler.js";
import type { TraversionGraph } from "./TraversionGraph.js";

declare global {
  interface Window {
    supportedFormatCache: Map<string, FileFormat[]>;
    traversionGraph: TraversionGraph;
    printSupportedFormatCache: () => string;
    showPopup: (html: string) => void;
    hidePopup: () => void;
    tryConvertByTraversing: (
      files: FileData[],
      from: ConvertPathNode,
      to: ConvertPathNode,
      signal?: AbortSignal,
      constraints?: {
        forceInputHandler?: boolean;
        forceOutputHandler?: boolean;
        inputHandlerName?: string;
        outputHandlerName?: string;
      }
    ) => Promise<{
      files: FileData[];
      path: ConvertPathNode[];
    } | null>;
    previewConvertPath: (
      from: ConvertPathNode,
      to: ConvertPathNode,
      simpleMode: boolean,
      constraints?: {
        forceInputHandler?: boolean;
        forceOutputHandler?: boolean;
        inputHandlerName?: string;
        outputHandlerName?: string;
      }
    ) => Promise<ConvertPathNode[] | null>;
    openPopup: () => boolean;
    closePopup: () => boolean;
    togglePopup: () => boolean;
  }
}

export { };
