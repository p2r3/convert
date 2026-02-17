import { ConvertPathNode, type FileFormat } from "./FormatHandler.ts";
import handlers from "./handlers";


// Parameters for pathfinding algorithm. Adjust as needed.
const CATEGORY_HARD_SEARCH : boolean = false; // If true, paths that change categories will be penalized based on how many categories differ. If false, any category change will have a fixed penalty.
const CATEGORY_CHANGE_COSTS : Array<{from: string, to: string, cost: number}> = [
    {from: "image", to: "video", cost: 1}, // Almost lossless
    {from: "video", to: "image", cost: 2}, // Potentially lossy and more complex
    {from: "image", to: "audio", cost: 10}, // Extremely lossy
    {from: "audio", to: "image", cost: 7}, // Very lossy
];
const DEFAULT_CATEGORY_CHANGE_COST : number = 3; // Default cost for category changes not specified in CATEGORY_CHANGE_COSTS

const LOSSY_COST : number = 2; // Cost multiplier for lossy conversions. Higher values will make the algorithm prefer lossless conversions more strongly.
const PRIORITY_COST : number = 0.025; // Cost multiplier for handler priority. Higher values will make the algorithm prefer handlers with higher priority more strongly.

export interface Node {
    mime: string;
    edges: Array<number>;
};

export interface Edge {
    from: {format: FileFormat, index: number};
    to: {format: FileFormat, index: number};
    handler: string;
    cost: number;
};

export class TraversionGraph {
    private nodes: Node[] = [];
    private edges: Edge[] = [];

    public init() {
        console.log("Initializing traversion graph...");
        const startTime = performance.now();
        window.supportedFormatCache.forEach((formats, handler) => {
            let fromIndices: Array<{format: FileFormat, index: number}> = [];
            let toIndices: Array<{format: FileFormat, index: number}> = [];
            formats.forEach(format => {
                let index = this.nodes.findIndex(node => node.mime === format.mime);
                if (index === -1) {
                    index = this.nodes.length;
                    this.nodes.push({ mime: format.mime, edges: [] });
                }
                if (format.from) fromIndices.push({format, index});
                if (format.to) toIndices.push({format, index});
            });
            fromIndices.forEach(from => {
                toIndices.forEach(to => {
                    if (from.index === to.index) return; // No self-loops
                    let cost = 1;
                    if (from.format.category && to.format.category) {
                        const fromCategories = Array.isArray(from.format.category) ? from.format.category : [from.format.category];
                        const toCategories = Array.isArray(to.format.category) ? to.format.category : [to.format.category];
                        if (CATEGORY_HARD_SEARCH) {
                            cost += CATEGORY_CHANGE_COSTS.reduce((totalCost, c) => {
                                // If the category change defined in CATEGORY_CHANGE_COSTS matches the categories of the formats, add the specified cost. Otherwise, if the categories are the same, add no cost. If the categories differ but no specific cost is defined for that change, add a default cost.
                                if (fromCategories.includes(c.from) && toCategories.includes(c.to))
                                    return totalCost + c.cost;
                                return totalCost + DEFAULT_CATEGORY_CHANGE_COST;
                            }, 0);
                        }
                        else if (!fromCategories.some(c => toCategories.includes(c))) {
                            const costs = CATEGORY_CHANGE_COSTS.filter(c =>
                                fromCategories.includes(c.from) && toCategories.includes(c.to)
                            )
                            if (costs.length === 0) cost += DEFAULT_CATEGORY_CHANGE_COST; // If no specific cost is defined for this category change, use the default cost
                            else cost += Math.min(...costs.map(c => c.cost)); // If multiple category changes are involved, use the lowest cost defined for those changes. This allows for more nuanced cost calculations when formats belong to multiple categories.
                        }
                    }
                    else if (from.format.category || to.format.category) {
                        cost += DEFAULT_CATEGORY_CHANGE_COST; // If one format has a category and the other doesn't, consider it a category change
                    }
                    cost += PRIORITY_COST * formats.indexOf(from.format); // Add cost based on handler priority (lower index means higher priority)
                    if (!to.format.lossless) cost *= LOSSY_COST; // If the output format is lossy or unspecified, apply the lossy cost multiplier
                    this.edges.push({
                        from: from,
                        to: to,
                        handler: handler,
                        cost: cost
                    });
                    this.nodes[from.index].edges.push(this.edges.length - 1);
                });
            });
        });
        const endTime = performance.now();
        console.log(`Traversion graph initialized in ${(endTime - startTime).toFixed(2)} ms with ${this.nodes.length} nodes and ${this.edges.length} edges.`);
    }
    public getData() : {nodes: Node[], edges: Edge[]} {
        return {nodes: this.nodes, edges: this.edges};
    }
    public print() {
        let output = "Nodes:\n";
        this.nodes.forEach((node, index) => {
            output += `${index}: ${node.mime}\n`;
        });
        output += "Edges:\n";
        this.edges.forEach((edge, index) => {
            output += `${index}: ${edge.from.format.mime} -> ${edge.to.format.mime} (handler: ${edge.handler}, cost: ${edge.cost})\n`;
        });
        console.log(output);
    }

    public async* searchPath(from: ConvertPathNode, to: ConvertPathNode, simpleMode: boolean) : AsyncGenerator<ConvertPathNode[]> {
        // Dijkstra's algorithm
        // Priority queue of {index, cost, path}
        let queue: Array<{index: number, cost: number, path: ConvertPathNode[]}> = [];
        let visited = new Set<number>();
        let fromIndex = this.nodes.findIndex(node => node.mime === from.format.mime);
        let toIndex = this.nodes.findIndex(node => node.mime === to.format.mime);
        if (fromIndex === -1 || toIndex === -1) return []; // If either format is not in the graph, return empty array
        queue.push({index: fromIndex, cost: 0, path: [from] });
        console.log(`Starting path search from ${from.format.mime}(${from.handler?.name}) to ${to.format.mime}(${to.handler?.name}) (simple mode: ${simpleMode})`);
        let iterations = 0;
        let pathsFound = 0;
        while (queue.length > 0) {
            iterations++;
            // Get the node with the lowest cost
            queue.sort((a, b) => a.cost - b.cost);
            let current = queue.shift()!;
            if (visited.has(current.index)) continue;
            if (current.index === toIndex) {
                // Return the path of handlers and formats to get from the input format to the output format
                console.log(`Found path at iteration ${iterations} with cost ${current.cost}: ${current.path.map(p => p.handler.name + "(" + p.format.mime + ")").join(" -> ")}`);
                if (simpleMode || !to.handler || to.handler.name === current.path.at(-1)?.handler.name) {
                    console.log(`Path valid! Yielding path: ${current.path.map(p => p.format.mime).join(" → ")}`);
                    yield current.path; 
                    pathsFound++;
                }
                continue; 
            }
            visited.add(current.index);
            this.nodes[current.index].edges.forEach(edgeIndex => {
                let edge = this.edges[edgeIndex];
                if (visited.has(edge.to.index)) return;
                const handler = handlers.find(h => h.name === edge.handler);
                if (!handler) return; // If the handler for this edge is not found, skip it
                queue.push({
                    index: edge.to.index,
                    cost: current.cost + edge.cost,
                    path: current.path.concat({handler: handler, format: edge.to.format})
                });
            });
            if (iterations % 100 === 0) {
                console.log(`Still searching... Iterations: ${iterations}, Paths found: ${pathsFound}, Queue length: ${queue.length}`);
            }
        }
        console.log(`Path search completed. Total iterations: ${iterations}, Total paths found: ${pathsFound}`);
    }
}