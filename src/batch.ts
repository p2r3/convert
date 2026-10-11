import type { FileData, FileFormat, HandlerDefinition } from "./FormatHandler.js";
import { stripExt } from "./common/index.js";

type Option = [FileFormat, HandlerDefinition];

export interface TargetGroup<T> {
  from: Option;
  to: Option;
  items: T[];
}

function optionKey([format, handler]: Option) {
  return `${handler.name}|${format.mime}(${format.format})`;
}

/**
 * Groups items that share an input and an output option, keeping first-seen order.
 * Items of one group are converted together, so handlers that merge their inputs still can.
 */
export function groupByTarget<T extends { from: Option; to: Option }>(
  items: T[],
): TargetGroup<T>[] {
  const groups = new Map<string, TargetGroup<T>>();
  for (const item of items) {
    const key = `${optionKey(item.from)}>${optionKey(item.to)}`;
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { from: item.from, to: item.to, items: [item] });
  }
  return [...groups.values()];
}

/** Renames repeated names to "name (2).ext", "name (3).ext" and so on. */
export function uniqueNames(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    let unique = name;
    for (let n = 2; taken.has(unique); n++) {
      const base = stripExt(name);
      unique = `${base} (${n})${name.slice(base.length)}`;
    }
    taken.add(unique);
    return unique;
  });
}

/**
 * Swaps each output for its input wherever the output isn't smaller.
 * Outputs are returned untouched if they don't map one-to-one onto the inputs.
 */
export function keepSmaller(inputs: FileData[], outputs: FileData[]): FileData[] {
  if (inputs.length !== outputs.length) return outputs;
  return outputs.map((output, i) =>
    output.bytes.length < inputs[i].bytes.length ? output : inputs[i],
  );
}
