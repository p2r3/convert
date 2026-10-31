import "./polyfills.ts";
import { ConvertPathNode, type FileFormat, type HandlerDefinition } from "./FormatHandler.ts";
import type { CategoryType } from "./Formats.ts";
import { PriorityQueue } from "./PriorityQueue.ts";
import * as comlink from "comlink";

export interface CostEntry {
  reason: string;
  cost: number;
}

const sumCosts = (costs: CostEntry[]) => costs.reduce((sum, entry) => sum + entry.cost, 0);

interface CostTrace {
  previous?: CostTrace;
  costs: CostEntry[];
}

interface QueueNode {
  index: number;
  cost: number;
  path: ConvertPathNode[];
  trace?: CostTrace;
}
interface CategoryChangeCost {
  from: CategoryType;
  to: CategoryType;
  handler?: string; // Optional handler name to specify that this cost only applies when using a specific handler for the category change. If not specified, the cost applies to all handlers for that category change.
  cost: number;
}

interface CategoryAdaptiveCost {
  categories: CategoryType[]; // List of sequential categories
  cost: number; // Cost to apply when a conversion involves all of the specified categories in sequence.
}

// Parameters for pathfinding algorithm.
const DEPTH_COST: number = 1; // Base cost for each conversion step. Higher values will make the algorithm prefer shorter paths more strongly.
const DEFAULT_CATEGORY_CHANGE_COST: number = 0.6; // Default cost for category changes not specified in CATEGORY_CHANGE_COSTS
const LOSSY_COST_MULTIPLIER: number = 1.4; // Cost multiplier for lossy conversions. Higher values will make the algorithm prefer lossless conversions more strongly.
const HANDLER_PRIORITY_COST: number = 0.02; // Cost multiplier for handler priority. Higher values will make the algorithm prefer handlers with higher priority more strongly.
const FORMAT_PRIORITY_COST: number = 0.05; // Cost multiplier for format priority. Higher values will make the algorithm prefer formats with higher priority more strongly.
const ANY_INPUT_COST: number = 2; // Extra cost for edges created via supportAnyInput. Discourages generic "pack" conversions so the algorithm prefers more specific conversion paths (e.g. rename-then-convert over wrapping a file as-is).

const LOG_FREQUENCY = 1000;
const MAX_QUEUED_PATHS = 15_000_000;

export interface Node {
  identifier: string;
  format: FileFormat;
  edges: Array<number>;
}

export interface Edge {
  from: { format: FileFormat; index: number };
  to: { format: FileFormat; index: number };
  handler: string;
  cost: number;
  costs: CostEntry[];
}

export class TraversionGraph {
  private handlers: HandlerDefinition[] = [];
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private categoryChangeCosts: CategoryChangeCost[] = [
    { from: "image", to: "video", cost: 0.2 }, // Almost lossless
    { from: "video", to: "image", cost: 0.4 }, // Potentially lossy and more complex
    { from: "image", to: "audio", handler: "ffmpeg", cost: 100 }, // FFMpeg can't convert images to audio
    { from: "audio", to: "image", handler: "ffmpeg", cost: 100 }, // FFMpeg can't convert audio to images
    { from: "text", to: "audio", handler: "ffmpeg", cost: 100 }, // FFMpeg can't convert text to audio
    { from: "audio", to: "text", handler: "ffmpeg", cost: 100 }, // FFMpeg can't convert audio to text
    { from: "image", to: "audio", cost: 1.4 }, // Extremely lossy
    { from: "audio", to: "image", cost: 1 }, // Very lossy
    { from: "video", to: "audio", cost: 1.4 }, // Might be lossy
    { from: "audio", to: "video", cost: 1 }, // Might be lossy
    { from: "text", to: "image", cost: 0.5 }, // Depends on the content and method, but can be relatively efficient for simple images
    { from: "image", to: "text", cost: 0.5 }, // Depends on the content and method, but can be relatively efficient for simple images
    { from: "text", to: "audio", cost: 0.6 }, // Somewhat lossy for anything that isn't speakable text
    { from: "document", to: "text", cost: 1 }, // Often very lossy, loses rich formatting
  ];
  private categoryAdaptiveCosts: CategoryAdaptiveCost[] = [
    { categories: ["text", "image", "audio"], cost: 15 }, // Text to audio through an image is likely not what the user wants
    { categories: ["image", "video", "audio"], cost: 10000 }, // Converting from image to audio through video is especially lossy
    { categories: ["audio", "video", "image"], cost: 10000 }, // Converting from audio to image through video is especially lossy
  ];
  // Keeps track of path segments that have failed when attempted during the last run
  private temporaryDeadEnds: ConvertPathNode[][] = [];

  // lookup caches rebuilt on every init() call
  private nodeIndexByIdentifier = new Map<string, number>();
  private handlerByName = new Map<string, HandlerDefinition>();
  private formatPriorityByHandler = new Map<string, Map<string, number>>();
  private handlerPairs = new Map<string, Set<string>>();

  public addCategoryChangeCost(
    from: CategoryType,
    to: CategoryType,
    cost: number,
    handler?: string,
    updateIfExists: boolean = true,
  ): boolean {
    if (this.hasCategoryChangeCost(from, to, handler)) {
      if (updateIfExists) {
        this.updateCategoryChangeCost(from, to, cost, handler);
        return true;
      }
      return false;
    }
    this.categoryChangeCosts.push({ from, to, cost, handler: handler?.toLowerCase() });
    return true;
  }
  public removeCategoryChangeCost(from: CategoryType, to: CategoryType, handler?: string): boolean {
    const initialLength = this.categoryChangeCosts.length;
    this.categoryChangeCosts = this.categoryChangeCosts.filter(
      (c) => !(c.from === from && c.to === to && c.handler === handler?.toLowerCase()),
    );
    return this.categoryChangeCosts.length < initialLength;
  }
  public updateCategoryChangeCost(
    from: CategoryType,
    to: CategoryType,
    cost: number,
    handler?: string,
  ) {
    const costEntry = this.categoryChangeCosts.find(
      (c) => c.from === from && c.to === to && c.handler === handler?.toLowerCase(),
    );
    if (costEntry) costEntry.cost = cost;
    else this.addCategoryChangeCost(from, to, cost, handler);
  }
  public hasCategoryChangeCost(from: CategoryType, to: CategoryType, handler?: string) {
    return this.categoryChangeCosts.some(
      (c) => c.from === from && c.to === to && c.handler === handler?.toLowerCase(),
    );
  }

  public addCategoryAdaptiveCost(
    categories: CategoryType[],
    cost: number,
    updateIfExists: boolean = true,
  ): boolean {
    if (this.hasCategoryAdaptiveCost(categories)) {
      if (updateIfExists) {
        this.updateCategoryAdaptiveCost(categories, cost);
        return true;
      }
      return false;
    }
    this.categoryAdaptiveCosts.push({ categories, cost });
    return true;
  }
  public removeCategoryAdaptiveCost(categories: CategoryType[]): boolean {
    const initialLength = this.categoryAdaptiveCosts.length;
    this.categoryAdaptiveCosts = this.categoryAdaptiveCosts.filter(
      (c) =>
        !(
          c.categories.length === categories.length &&
          c.categories.every((cat, index) => cat === categories[index])
        ),
    );
    return this.categoryAdaptiveCosts.length < initialLength;
  }
  public updateCategoryAdaptiveCost(categories: CategoryType[], cost: number) {
    const costEntry = this.categoryAdaptiveCosts.find(
      (c) =>
        c.categories.length === categories.length &&
        c.categories.every((cat, index) => cat === categories[index]),
    );
    if (costEntry) costEntry.cost = cost;
    else this.addCategoryAdaptiveCost(categories, cost);
  }
  public hasCategoryAdaptiveCost(categories: CategoryType[]) {
    return this.categoryAdaptiveCosts.some(
      (c) =>
        c.categories.length === categories.length &&
        c.categories.every((cat, index) => cat === categories[index]),
    );
  }

  public addDeadEndPath(pathFragment: ConvertPathNode[]) {
    this.temporaryDeadEnds.push(pathFragment);
  }
  public clearDeadEndPaths() {
    this.temporaryDeadEnds.length = 0;
  }

  /**
   * Initializes the traversion graph based on the handlers. This should be called after all handlers have been registered and their supported formats have been assigned to them. The graph is built by creating nodes for each unique file format and edges for each possible conversion between formats based on the handlers' capabilities.
   * @param strictCategories If true, the algorithm will apply category change costs more strictly, even when formats share categories. This can lead to more accurate pathfinding at the cost of potentially longer paths and increased search time. If false, category change costs will only be applied when formats do not share any categories, allowing for more flexible pathfinding that may yield shorter paths but with less nuanced cost calculations.
   */
  public init(handlers: HandlerDefinition[], strictCategories: boolean = false) {
    this.handlers = handlers;
    this.nodes.length = 0;
    this.edges.length = 0;

    // rebuild lookup caches
    this.nodeIndexByIdentifier.clear();
    this.handlerByName = new Map(handlers.map((h) => [h.name, h]));
    this.formatPriorityByHandler = new Map(
      handlers.map((h) => {
        const priorities = new Map<string, number>();
        (h.supportedFormats ?? []).forEach((f, i) => {
          if (!priorities.has(f.mime)) priorities.set(f.mime, i);
        });
        return [h.name, priorities];
      }),
    );
    this.handlerPairs.clear();
    for (const c of this.categoryChangeCosts) {
      if (!c.handler) continue;
      const pair = `${c.from}->${c.to}`;
      if (!this.handlerPairs.has(pair)) this.handlerPairs.set(pair, new Set());
      this.handlerPairs.get(pair)!.add(c.handler);
    }

    console.log("Initializing traversion graph...");
    const startTime = performance.now();

    let handlerIndex = 0;
    handlers.forEach((handler) => {
      let fromIndices: Array<{ format: FileFormat; index: number }> = [];
      let toIndices: Array<{ format: FileFormat; index: number }> = [];
      handler.supportedFormats?.forEach((format) => {
        const formatIdentifier = format.mime + `(${format.format})`;
        let index = this.nodeIndexByIdentifier.get(formatIdentifier) ?? -1;
        if (index === -1) {
          index = this.nodes.length;
          this.nodes.push({
            identifier: formatIdentifier,
            format: format,
            edges: [],
          });
          this.nodeIndexByIdentifier.set(formatIdentifier, index);
        }
        if (format.from) fromIndices.push({ format, index });
        if (format.to) toIndices.push({ format, index });
      });
      fromIndices.forEach((from) => {
        toIndices.forEach((to) => {
          if (from.index === to.index) return; // No self-loops
          const costs = this.costFunction(from, to, strictCategories, handler.name, handlerIndex);
          this.edges.push({
            from: from,
            to: to,
            handler: handler.name,
            cost: sumCosts(costs),
            costs,
          });
          this.nodes[from.index].edges.push(this.edges.length - 1);
        });
      });
      handlerIndex++;
    });

    // Add edges for handlers with supportAnyInput.
    // These handlers can accept any format as input, so we create edges
    // from every known format node to their output formats.
    handlers.forEach((handler, hIndex) => {
      if (!handler.supportAnyInput) return;
      if (!handler.supportedFormats) return;

      // Collect output format node indices for this handler
      const toEntries: Array<{ format: FileFormat; index: number }> = [];
      for (const f of handler.supportedFormats) {
        if (!f.to) continue;
        const id = f.mime + `(${f.format})`;
        const idx = this.nodeIndexByIdentifier.get(id) ?? -1;
        if (idx !== -1) toEntries.push({ format: f, index: idx });
      }

      // pre-build edge key set to avoid O(edges) scan per (node, output) pair
      const existingEdgeKeys = new Set<string>();
      for (const node of this.nodes) {
        for (const eIdx of node.edges) {
          const e = this.edges[eIdx];
          existingEdgeKeys.add(`${e.from.index}:${e.to.index}:${e.handler}`);
        }
      }

      // Create edges from every known format node to each output format
      this.nodes.forEach((fromNode, fromIndex) => {
        for (const to of toEntries) {
          if (fromIndex === to.index) continue;
          if (existingEdgeKeys.has(`${fromIndex}:${to.index}:${handler.name}`)) continue;

          const costs = this.costFunction(
            { format: fromNode.format, index: fromIndex },
            { format: to.format, index: to.index },
            strictCategories,
            handler.name,
            hIndex,
          );
          costs.push({ reason: "Any input surcharge", cost: ANY_INPUT_COST });
          this.edges.push({
            from: { format: fromNode.format, index: fromIndex },
            to: { format: to.format, index: to.index },
            handler: handler.name,
            cost: sumCosts(costs),
            costs,
          });
          this.nodes[fromIndex].edges.push(this.edges.length - 1);
        }
      });
    });

    const endTime = performance.now();
    console.log(
      `Traversion graph initialized in ${(endTime - startTime).toFixed(2)} ms with ${this.nodes.length} nodes and ${this.edges.length} edges.`,
    );
  }
  /**
   * Cost function for calculating the cost of converting from one format to another using a specific handler.
   */
  private costFunction(
    from: { format: FileFormat; index: number },
    to: { format: FileFormat; index: number },
    strictCategories: boolean,
    handler: string,
    handlerIndex: number,
  ) {
    const costs: CostEntry[] = [{ reason: "Base step", cost: DEPTH_COST }];
    const addCategoryCost = (from: string, to: string, cost: number) =>
      costs.push({ reason: `Category ${from} → ${to} (${handler})`, cost });

    // Calculate category change cost
    const fromCategories = Array.isArray(from.format.category)
      ? from.format.category
      : [from.format.category];
    const toCategories = Array.isArray(to.format.category)
      ? to.format.category
      : [to.format.category];
    if (strictCategories) {
      // If the category change defined in CATEGORY_CHANGE_COSTS matches the categories of the formats, add the specified cost. Otherwise, if the categories are the same, add no cost. If the categories differ but no specific cost is defined for that change, add a default cost.
      for (const fromCat of fromCategories) {
        for (const toCat of toCategories) {
          if (fromCat === toCat) continue;
          const costs = this.categoryChangeCosts.filter(
            (c) =>
              c.from === fromCat &&
              c.to === toCat &&
              (!c.handler || c.handler === handler.toLowerCase()),
          );
          if (costs.length) {
            for (const c of costs) addCategoryCost(c.from, c.to, c.cost);
          } else addCategoryCost(fromCat, toCat, DEFAULT_CATEGORY_CHANGE_COST);
        }
      }
    } else if (!fromCategories.some((c) => toCategories.includes(c))) {
      let costs = this.categoryChangeCosts.filter(
        (c) =>
          fromCategories.includes(c.from) &&
          toCategories.includes(c.to) &&
          ((!c.handler &&
            !this.handlerPairs.get(`${c.from}->${c.to}`)?.has(handler.toLowerCase())) ||
            c.handler === handler.toLowerCase()),
      );
      if (costs.length === 0)
        addCategoryCost(
          fromCategories.join("/"),
          toCategories.join("/"),
          DEFAULT_CATEGORY_CHANGE_COST,
        ); // If no specific cost is defined for this category change, use the default cost
      else {
        const selected = costs.reduce((a, b) => (a.cost <= b.cost ? a : b));
        addCategoryCost(selected.from, selected.to, selected.cost);
      } // If multiple category changes are involved, use the lowest cost defined for those changes. This allows for more nuanced cost calculations when formats belong to multiple categories.
    }

    // Add cost based on handler priority
    costs.push({
      reason: `Handler priority (${handlerIndex})`,
      cost: HANDLER_PRIORITY_COST * handlerIndex,
    });

    // Add cost based on format priority
    const formatPriority = this.formatPriorityByHandler.get(handler)?.get(to.format.mime) ?? 0;
    costs.push({
      reason: `Format priority (${formatPriority})`,
      cost: FORMAT_PRIORITY_COST * formatPriority,
    });

    // Add cost multiplier for lossy conversions
    if (!to.format.lossless) {
      const subtotal = sumCosts(costs);
      costs.push({
        reason: `Lossy ×${LOSSY_COST_MULTIPLIER}`,
        cost: subtotal * LOSSY_COST_MULTIPLIER - subtotal,
      });
    }

    return costs;
  }

  /**
   * Returns a copy of the graph data, including nodes, edges, category change costs, and category adaptive costs. This can be used for debugging, visualization, or analysis purposes. The returned data is a deep copy to prevent external modifications from affecting the internal state of the graph.
   */
  public getData(): {
    nodes: Node[];
    edges: Edge[];
    categoryChangeCosts: CategoryChangeCost[];
    categoryAdaptiveCosts: CategoryAdaptiveCost[];
  } {
    return {
      nodes: this.nodes.map((node) => ({
        identifier: node.identifier,
        format: { ...node.format },
        edges: [...node.edges],
      })),
      edges: this.edges.map((edge) => ({
        from: { format: { ...edge.from.format }, index: edge.from.index },
        to: { format: { ...edge.to.format }, index: edge.to.index },
        handler: edge.handler,
        cost: edge.cost,
        costs: edge.costs.map((c) => ({ ...c })),
      })),
      categoryChangeCosts: this.categoryChangeCosts.map((c) => ({
        from: c.from,
        to: c.to,
        handler: c.handler,
        cost: c.cost,
      })),
      categoryAdaptiveCosts: this.categoryAdaptiveCosts.map((c) => ({
        categories: [...c.categories],
        cost: c.cost,
      })),
    };
  }
  /**
   * @coverageIgnore
   */
  public print() {
    let output = "Nodes:\n";
    this.nodes.forEach((node, index) => {
      output += `${index}: ${node.identifier}\n`;
    });
    output += "Edges:\n";
    this.edges.forEach((edge, index) => {
      output += `${index}: ${edge.from.format.mime} -> ${edge.to.format.mime} (handler: ${edge.handler}, cost: ${edge.cost})\n`;
    });
    console.log(output);
  }

  private listeners: Array<(state: string, path: ConvertPathNode[]) => void> = [];
  public addPathEventListener(listener: (state: string, path: ConvertPathNode[]) => void) {
    this.listeners.push(listener);
  }

  private dispatchEvent(state: string, path: ConvertPathNode[]) {
    this.listeners.forEach((l) => l(state, path));
  }

  private calculateRemainingCosts(toIndex: number): number[] {
    const incomingEdges: Edge[][] = this.nodes.map(() => []);
    for (const edge of this.edges) incomingEdges[edge.to.index].push(edge);

    const costs = this.nodes.map(() => Infinity);
    costs[toIndex] = 0;
    const queue = new PriorityQueue<{ index: number; cost: number }>(
      1000,
      (a, b) => a.cost - b.cost,
    );
    queue.add({ index: toIndex, cost: 0 });
    while (queue.size() > 0) {
      const current = queue.poll()!;
      if (current.cost > costs[current.index]) continue;
      for (const edge of incomingEdges[current.index]) {
        const cost = current.cost + edge.cost;
        if (cost >= costs[edge.from.index]) continue;
        costs[edge.from.index] = cost;
        queue.add({ index: edge.from.index, cost });
      }
    }
    return costs;
  }

  public async *searchPath(
    from: ConvertPathNode,
    to: ConvertPathNode,
    simpleMode: boolean,
    isCancelled?: () => boolean | Promise<boolean>,
    debug?: (costs: (CostEntry & { step: number })[], total: number) => void,
  ): AsyncGenerator<ConvertPathNode[]> {
    // A*: base edge costs estimate the remaining costs
    const fromIdentifier = from.format.mime + `(${from.format.format})`;
    const toIdentifier = to.format.mime + `(${to.format.format})`;
    const fromIndex = this.nodeIndexByIdentifier.get(fromIdentifier) ?? -1;
    const toIndex = this.nodeIndexByIdentifier.get(toIdentifier) ?? -1;
    if (fromIndex === -1 || toIndex === -1) return []; // If either format is not in the graph, return empty array
    const remainingCosts = this.calculateRemainingCosts(toIndex);
    if (!Number.isFinite(remainingCosts[fromIndex])) return;
    const queue = new PriorityQueue<QueueNode>(
      1000,
      (a, b) => a.cost + remainingCosts[a.index] - (b.cost + remainingCosts[b.index]),
    );
    queue.add({ index: fromIndex, cost: 0, path: [from] });
    console.log(
      `Starting path search from ${from.format.mime}(${from.handler?.name}) to ${to.format.mime}(${to.handler?.name}) (simple mode: ${simpleMode})`,
    );
    let iterations = 0;
    let pathsFound = 0;
    while (queue.size() > 0) {
      // Awaiting a proxied callback lets the UI cancel even before a path is found.
      if (iterations % LOG_FREQUENCY === 0 && (await isCancelled?.())) return;
      iterations++;
      // Get the node with the lowest cost
      let current = queue.poll()!;
      // A failed conversion can invalidate paths already in the queue.
      if (!Number.isFinite(sumCosts(this.calculateAdaptiveCosts(current.path)))) continue;
      if (current.index === toIndex) {
        // Return the path of handlers and formats to get from the input format to the output format
        const logString = `${iterations} with cost ${current.cost.toFixed(3)}: ${current.path.map((p) => p.handler.name + "(" + p.format.mime + ")").join(" → ")}`;
        const foundPathLast = current.path.at(-1);
        if (simpleMode || !to.handler || to.handler.name === foundPathLast?.handler.name) {
          console.log(`Found path at iteration ${logString}`);
          if (debug) {
            const steps: CostEntry[][] = [];
            for (let trace = current.trace; trace; trace = trace.previous) steps.push(trace.costs);
            const costs = steps
              .toReversed()
              .flatMap((entries, i) => entries.map((entry) => ({ step: i + 1, ...entry })));
            debug(costs, current.cost);
          }
          this.dispatchEvent("found", current.path);
          yield current.path;
          pathsFound++;
        } else {
          console.log(`Unvalid path at iteration ${logString}`);
          this.dispatchEvent("skipped", current.path);
        }
        continue;
      }
      this.dispatchEvent("searching", current.path);
      this.nodes[current.index].edges.forEach((edgeIndex) => {
        let edge = this.edges[edgeIndex];
        if (!Number.isFinite(remainingCosts[edge.to.index])) return;
        if (
          current.path.some(
            (node) =>
              node.format.mime === edge.to.format.mime &&
              node.format.format === edge.to.format.format,
          )
        )
          return;
        const handler = this.handlerByName.get(edge.handler);
        if (!handler) return; // If the handler for this edge is not found, skip it

        let path = current.path.concat({ handler: handler, format: edge.to.format });
        const adaptiveCosts = this.calculateAdaptiveCosts(path);
        if (!Number.isFinite(sumCosts(adaptiveCosts))) return;
        if (queue.size() >= MAX_QUEUED_PATHS) {
          queue.clear();
          throw new Error("Conversion path search limit exceeded. Try a different output format.");
        }
        queue.add({
          index: edge.to.index,
          cost: current.cost + edge.cost + sumCosts(adaptiveCosts),
          trace: debug
            ? { previous: current.trace, costs: [...edge.costs, ...adaptiveCosts] }
            : undefined,
          path: path,
        });
      });
      if (iterations % LOG_FREQUENCY === 0) {
        console.log(
          `Still searching... Iterations: ${iterations}, Paths found: ${pathsFound}, Queue length: ${queue.size()}`,
        );
      }
    }
    console.log(
      `Path search completed. Total iterations: ${iterations}, Total paths found: ${pathsFound}`,
    );
  }

  public searchPathProxied(
    from: ConvertPathNode,
    to: ConvertPathNode,
    simpleMode: boolean,
    isCancelled?: () => boolean | Promise<boolean>,
  ) {
    return comlink.proxy(this.searchPath(from, to, simpleMode, isCancelled));
  }

  private calculateAdaptiveCosts(path: ConvertPathNode[]): CostEntry[] {
    for (const deadEnd of this.temporaryDeadEnds) {
      let isDeadEnd = true;
      for (let i = 0; i < deadEnd.length; i++) {
        if (
          path[i]?.handler.name === deadEnd[i].handler.name &&
          path[i]?.format.mime === deadEnd[i].format.mime &&
          path[i]?.format.format === deadEnd[i].format.format
        )
          continue;
        isDeadEnd = false;
        break;
      }
      if (isDeadEnd) return [{ reason: "Dead end", cost: Infinity }];
    }
    const costs: CostEntry[] = [];
    const categoriesInPath = path.map((p) =>
      Array.isArray(p.format.category) ? p.format.category : [p.format.category],
    );
    const endsWithSequence = (categories: CategoryType[], end: number) => {
      let pathPtr = end,
        categoryPtr = categories.length - 1;
      while (pathPtr >= 0) {
        if (categoriesInPath[pathPtr].includes(categories[categoryPtr])) {
          categoryPtr--;
          pathPtr--;
          if (categoryPtr < 0) return true;
        } else if (
          categoryPtr + 1 < categories.length &&
          categoriesInPath[pathPtr].includes(categories[categoryPtr + 1])
        ) {
          pathPtr--;
        } else return false;
      }
      return false;
    };
    const last = categoriesInPath.length - 1;
    this.categoryAdaptiveCosts.forEach((c) => {
      if (endsWithSequence(c.categories, last) && !endsWithSequence(c.categories, last - 1)) {
        costs.push({ reason: `Adaptive ${c.categories.join(" → ")}`, cost: c.cost });
      }
    });
    return costs;
  }
}

if (typeof document === "undefined") comlink.expose(TraversionGraph);
