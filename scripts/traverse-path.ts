import { exit } from "node:process";
import { ConvertPathNode, type FileFormat, type HandlerDefinition } from "../src/FormatHandler";
import { TraversionGraph } from "../src/TraversionGraph";
import { join } from "node:path";

const CACHE_FILE = join(process.cwd(), "dist/cache.json");

const args = Bun.argv.slice(2).filter((arg) => arg !== "--breakdown");
const breakdown = Bun.argv.includes("--breakdown");

if (args.length < 3) {
  console.log(
    "Usage: bun run scripts/traverse-path.ts <max-paths> <ext-from>[#<mime-from>][#<format-from>] <ext-to>[#<mime-to>][#<format-to>] [--breakdown]",
  );
  console.log("ex. bun run scripts/traverse-path.ts 10 mp3 ogg#audio/ogg");
  exit(1);
}

const handlers: HandlerDefinition[] = await Bun.file(CACHE_FILE).json();
const traversionGraph = new TraversionGraph();
traversionGraph.init(handlers);

const nodes: ConvertPathNode[] = handlers.flatMap((handler) => {
  if (!handler.supportedFormats) throw new Error(`${handler.name} has no formats`);
  return handler.supportedFormats?.map((format) => ({ format, handler }));
});

function findNode(text: string, filterKey: keyof FileFormat) {
  const [ext, mime, format] = text.split("#");

  const found = nodes.find(
    (node) =>
      ext === node.format.extension &&
      (mime ? mime === node.format.mime : true) &&
      (format ? format === node.format.format : true) &&
      node.format[filterKey],
  );
  if (!found) throw new Error(`could not find file format ${text}`);

  console.log(
    `${text} is: ${found.format.mime} "${found.format.name}" (format ${found.format.format}, extension ${found.format.extension})`,
  );
  console.log(
    `Which is supported by: ${nodes
      .filter(
        (node) =>
          node.format.mime === found.format.mime &&
          node.format.format === found.format.format &&
          node.format[filterKey],
      )
      .map((node) => node.handler.name)
      .join(", ")}`,
  );

  return found;
}

console.log();
const from = findNode(args[1], "from");
const to = findNode(args[2], "to");
console.log();

const search = traversionGraph.searchPath(from, to, {
  simpleMode: true,
  debug: breakdown
    ? (costs, total) => {
        const steps = new Map<number, string[]>();
        for (const { step, reason, cost } of costs) {
          if (!steps.has(step)) steps.set(step, []);
          steps.get(step)!.push(`${reason}: ${Number(cost.toFixed(6))}`);
        }
        for (const [step, entries] of steps) {
          console.log(`Step ${step}: ${entries.join(", ")}`);
        }
        console.log(`Total cost: ${total}`);
        console.log();
      }
    : undefined,
});
for (let i = 0; i < Number(args[0]); i++) {
  const { done, value: path } = await search.next();
  if (done) break;

  traversionGraph.addDeadEndPath(path);
}

exit(0);
