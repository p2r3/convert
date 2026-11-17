import { DOMParser as LinkedomParser } from "linkedom/worker";

/**
 * linkedom's DOMParser, for workers where there's no real one. It's typed as the DOM's own, which
 * is what the code using it expects and what linkedom implements.
 */
// linkedom's own typings don't line up with lib.dom's
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
export const WorkerDOMParser = LinkedomParser as unknown as typeof DOMParser;
