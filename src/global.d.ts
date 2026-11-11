import type { FileData, ConvertPathNode, HandlerDefinition } from "./FormatHandler.js";
import type { TraversionGraph } from "./TraversionGraph.js";
import type { Remote } from "comlink";
import type { DesktopUpdater } from "./ui/UpdateStore.js";
import type { ConvertOptions } from "./Settings.js";

declare global {
  interface Window {
    handlerDefs: HandlerDefinition[];
    traversionGraph: Remote<TraversionGraph> | TraversionGraph;
    printSupportedFormatCache: () => string;
    showPopup: (html: string) => void;
    hidePopup: () => void;
    tryConvertByTraversing: (
      files: FileData[],
      from: ConvertPathNode,
      to: ConvertPathNode,
      options?: { abort?: AbortSignal; settings?: ConvertOptions },
    ) => Promise<{
      files: FileData[];
      path: ConvertPathNode[];
    } | null>;
    tryConvertByPath: (
      files: FileData[],
      path: ConvertPathNode[],
      options?: { abort?: AbortSignal },
    ) => Promise<{
      files: FileData[];
      path: ConvertPathNode[];
    } | null>;
    /** Only defined in the desktop app, exposed by src/electron-preload.cjs */
    desktopUpdater?: DesktopUpdater;
  }

  var baseUrl: string | undefined;
  const __EXCLUDED_HANDLERS__: string[];
}
