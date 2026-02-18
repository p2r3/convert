import type { FileFormat } from "./FormatHandler.js";
import type { TraversionGraph } from "./TraversionGraph.js";

declare global {
  interface Window {
    supportedFormatCache: Map<string, FileFormat[]>;
    traversionGraph: TraversionGraph;
    printSupportedFormatCache: () => string;
    showPopup: (html: string) => void;
    hidePopup: () => void;
  }
}

export { };
