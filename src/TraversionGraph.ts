import { ConvertPathNode, type FileFormat } from "./FormatHandler.ts";
import handlers from "./handlers";
import { PriorityQueue } from './PriorityQueue.ts';


// Parameters for pathfinding algorithm. Adjust as needed.
const DEPTH_COST: number = 1; // Base cost for each conversion step. Higher values will make the algorithm prefer shorter paths more strongly.

const CATEGORY_HARD_SEARCH : boolean = false; // If true, paths that change categories will be penalized based on how many categories differ. If false, any category change will have a fixed penalty.
const CATEGORY_CHANGE_COSTS : Array<{from: string, to: string, cost: number}> = [
    {from: "image", to: "video", cost: 0.2}, // Almost lossless
    {from: "video", to: "image", cost: 0.4}, // Potentially lossy and more complex
    {from: "image", to: "audio", cost: 2}, // Extremely lossy
    {from: "audio", to: "image", cost: 1.4}, // Very lossy
    {from: "video", to: "audio", cost: 1}, // Might be lossy 
    {from: "audio", to: "video", cost: 1}, // Might be lossy
    {from: "text", to: "image", cost: 0.5}, // Depends on the content and method, but can be relatively efficient for simple images
    {from: "image", to: "text", cost: 0.5}, // Depends on the content and method, but can be relatively efficient for simple images
];
const DEFAULT_CATEGORY_CHANGE_COST : number = 0.6; // Default cost for category changes not specified in CATEGORY_CHANGE_COSTS

const LOSSY_COST_MULTIPLIER : number = 1.4; // Cost multiplier for lossy conversions. Higher values will make the algorithm prefer lossless conversions more strongly.
const PRIORITY_COST : number = 0.05; // Cost multiplier for handler priority. Higher values will make the algorithm prefer handlers with higher priority more strongly.

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

interface QueueNode {
    index: number;
    cost: number;
    path: ConvertPathNode[];
    visitedBorder: number;
}

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
                    let cost = DEPTH_COST; // Base cost for each conversion step
                    const fromCategory = from.format.category || from.format.mime.split("/")[0];
                    const toCategory = to.format.category || to.format.mime.split("/")[0];
                    if (fromCategory && toCategory) {
                        const fromCategories = Array.isArray(fromCategory) ? fromCategory : [fromCategory];
                        const toCategories = Array.isArray(toCategory) ? toCategory : [toCategory];
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
                    else if (fromCategory || toCategory) {
                        // If one format has a category and the other doesn't, consider it a category change
                        // Should theoretically never be encountered, unless the MIME type is misspecified
                        cost += DEFAULT_CATEGORY_CHANGE_COST;
                    }
                    cost += PRIORITY_COST * formats.indexOf(from.format); // Add cost based on handler priority (lower index means higher priority)
                    if (!to.format.lossless) cost *= LOSSY_COST_MULTIPLIER; // If the output format is lossy or unspecified, apply the lossy cost multiplier
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
        let queue: PriorityQueue<QueueNode> = new PriorityQueue<QueueNode>(
            1000,
            (a: QueueNode, b: QueueNode) => a.cost - b.cost
        );
        let visited = new Array<number>();
        let fromIndex = this.nodes.findIndex(node => node.mime === from.format.mime);
        let toIndex = this.nodes.findIndex(node => node.mime === to.format.mime);
        if (fromIndex === -1 || toIndex === -1) return []; // If either format is not in the graph, return empty array
        queue.add({index: fromIndex, cost: 0, path: [from], visitedBorder: visited.length });
        console.log(`Starting path search from ${from.format.mime}(${from.handler?.name}) to ${to.format.mime}(${to.handler?.name}) (simple mode: ${simpleMode})`);
        let iterations = 0;
        let pathsFound = 0;
        while (queue.size() > 0) {
            iterations++;
            // Get the node with the lowest cost
            let current = queue.poll()!;
            const indexInVisited = visited.indexOf(current.index);
            if (indexInVisited >= 0 && indexInVisited < current.visitedBorder) continue;
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
            visited.push(current.index);
            this.nodes[current.index].edges.forEach(edgeIndex => {
                let edge = this.edges[edgeIndex];
                const indexInVisited = visited.indexOf(edge.to.index);
                if (indexInVisited >= 0 && indexInVisited < current.visitedBorder) return;
                const handler = handlers.find(h => h.name === edge.handler);
                if (!handler) return; // If the handler for this edge is not found, skip it
                queue.add({
                    index: edge.to.index,
                    cost: current.cost + edge.cost,
                    path: current.path.concat({handler: handler, format: edge.to.format}),
                    visitedBorder: visited.length
                });
            });
            if (iterations % 100 === 0) {
                console.log(`Still searching... Iterations: ${iterations}, Paths found: ${pathsFound}, Queue length: ${queue.size()}`);
            }
        }
        console.log(`Path search completed. Total iterations: ${iterations}, Total paths found: ${pathsFound}`);
    }
}