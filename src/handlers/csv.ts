import CommonFormats from 'src/CommonFormats.ts';
import { type FileData, type FileFormat, type FormatHandler } from '../FormatHandler.ts';

export type Flat = { header: string[]; data: string[][] };
type SolverState = { rows: number; cols: number; K: number[] };

type Primitive = string | number | boolean | symbol | bigint | null | undefined;
type Path = string[];

const pathEsc = '\\';
const pathSep = '.';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export default class csvHandler implements FormatHandler {
    name = 'CSV';
    supportedFormats = [CommonFormats.JSON.builder('json').allowFrom(true), CommonFormats.CSV.builder('csv').allowTo()];
    ready: boolean = true;
    async init() {
        this.ready = true;
    }
    async doConvert(inputFiles: FileData[], inputFormat: FileFormat, outputFormat: FileFormat, args?: string[]) {
        if (inputFormat.internal !== 'json') throw new Error('expected json as the input format');
        return inputFiles.map(f => {
            const baseName = f.name.replace(/\.[^.]+$/u, '');
            const json = decoder.decode(f.bytes);
            const data = JSON.parse(json) as unknown;
            const flat = flatten(data);
            const csv = toCsv(flat);
            return {
                name: `${baseName}.${outputFormat.extension}`,
                bytes: encoder.encode(csv),
            };
        });
    }
}

export function toCsv(x: Flat, sep = ',', quot = '"') {
    const csvrow = (arr: string[]) =>
        arr
            .map(s => (s.includes(sep) || s.includes(quot) ? `${quot}${s.replaceAll(quot, quot + quot)}${quot}` : s))
            .join(sep);
    return [x.header, ...x.data].map(row => csvrow(row)).join('\n');
}

// If handlers start accepting arbitrary values, we should probably handle toJSON.

export function flatten(x: unknown): Flat {
    // Non-object: 1*1 "table"
    if (!isBag(x)) {
        return {
            header: ['value'],
            data: [[stringify(x)]],
        };
    }
    const paths = Array.from(gPaths(x, 'primitives'), ([k]) => k);
    const splits = solveTableSplit({
        paths,
    });
    // we have our split for each path
    // keep distinct row and col fragments
    // place values based on path [R, C]

    // omit key if all rows are empty
    const rows = splits.every(s => s === 0)
        ? null
        : removeDuplicates(paths.map((p, i) => encodePath(p.slice(0, splits[i]))));
    const rowCount = rows?.length ?? 1;
    const hasRowKeys = rows !== null;
    const cols = removeDuplicates(paths.map((p, i) => encodePath(p.slice(splits[i]))));

    const data = Array.from({ length: rowCount }, () => new Array(+hasRowKeys + cols.length));

    for (let i = 0; i < rowCount; ++i) {
        const row = decodePath(rows?.[i]);
        if (hasRowKeys) data[i][0] = rows[i] ?? '';
        for (let j = 0; j < cols.length; ++j) {
            const path = [...row, ...decodePath(cols[j])];
            data[i][+hasRowKeys + j] = stringify(follow(path, x));
        }
    }

    return {
        header: [...(hasRowKeys ? ['key'] : []), ...cols.map(col => col ?? 'value')],
        data,
    };
}

export function solveTableSplit({ paths, log }: { paths: Path[]; log?: (...args: unknown[]) => void }): number[] {
    if (!paths.length) return [];

    const N = paths.map(p => p.length).reduce((max, x) => (x < max ? max : x));
    const R = new Set<Primitive>();
    const C = new Set<Primitive>();
    // fixed split method.
    // 1. choose a k in 0..N-1 . it is the maximum prefix length.
    // 2. count how many R and C would exist at that split
    // 3. update best k vector based on minimum cost
    let best: SolverState = { rows: Infinity, cols: Infinity, K: [] };
    // prefixes (vary column length)
    let logMode: string = 'prefix';
    splitCost((k, p) => Math.min(k, p.length - 1));
    // suffixes (vary row length)
    logMode = 'suffix';
    splitCost((k, p) => p.length - Math.min(k, p.length - 1));
    return best.K;

    function splitCost(chooseK_: (k: number, p: Path) => number) {
        for (let k = 0; k < N; ++k) {
            R.clear();
            C.clear();

            const logSplits: { r: string; k_: number; c: string }[] | null = log ? [] : null;
            const K = paths.map(p => {
                if (!p.length)
                    throw new Error(
                        "path shouldn't be empty. empty path only occurs on primitive values can be the only path of a primitve value. this is a bug.",
                    );
                let k_ = chooseK_(k, p);
                // r and c may be empty
                const r = encodePath(p.slice(0, k_)); // may be empty
                const c = encodePath(p.slice(k_)); // must not be empty
                logSplits?.push({ r: r?.toString() ?? '', k_, c: c?.toString() ?? '' });

                R.add(r);
                C.add(c);
                return k_;
            });
            const state = { rows: R.size, cols: C.size, K };
            const maxRlen = logSplits?.reduce((cur, x) => Math.max(cur, x.r.length), 0);
            logSplits?.forEach(({ r, k_, c }) =>
                log?.(logMode, k, 'split', r.toString().padStart(maxRlen!), k_, c.toString()),
            );
            const isBetter = compare(state, best) > 0;
            log?.(logMode, k, 'result', `rows:${state.rows}`, `cols:${state.cols}`, isBetter ? 'NEW BEST' : '');
            if (isBetter) {
                best = state;
            }
        }
    }
}

/**
 * >0 if a is better than b,
 * <0 if b is better then a,
 * 0 if rows and cols are equal
 */
function compare(a: SolverState, b: SolverState) {
    return (
        b.rows + b.cols - a.rows - a.cols || // minimize rows + cols
        b.cols - a.cols || // minimize cols
        a.rows - b.rows // maximize rows
    );
}

/* 
a,b -> a.b
a.b -> a\.b
a\,b -> a\\.b
a\.b -> a\\\.b 
a\\,b -> a\\\\.b
a\\.b -> a\\\\\.b

count \ before dot
if even -> split, add n/2 \ at the end
if odd -> dot, add (n-1)/2 \ as the end
 */
export function encodePath(path: Readonly<Path>): string | null {
    if (!path.length) return null;
    return path
        .map((part, i) => {
            // possible optimiation: if !part.includes(sep) return part

            let out = '';
            let carets = 0;

            for (let i = 0; i < part.length; i++) {
                const c = part[i];

                if (c === pathEsc) {
                    carets++;
                } else if (c === pathSep) {
                    out += pathEsc.repeat(carets * 2 + 1) + pathSep;
                    carets = 0;
                } else {
                    out += pathEsc.repeat(carets) + c;
                    carets = 0;
                }
            }
            out += pathEsc.repeat(carets * (1 + +(i < path.length - 1)));
            return out;
        })
        .join('.');
}
export function decodePath(path: string | null | undefined) {
    // possible optimiation: if !path.includes(esc) return path.split(sep)
    if (path === null || path === undefined) return [];
    const parts: string[] = [];
    let current = '';
    let carets = 0;

    for (let i = 0; i < path.length; i++) {
        const c = path[i];

        if (c === pathEsc) {
            carets++;
            continue;
        }

        if (c === pathSep) {
            if (carets % 2 === 0) {
                current += pathEsc.repeat(carets / 2);
                parts.push(current);
                current = '';
            } else {
                current += pathEsc.repeat((carets - 1) / 2) + pathSep;
            }
            carets = 0;
            continue;
        }

        current += pathEsc.repeat(carets);
        carets = 0;
        current += c;
    }

    current += pathEsc.repeat(carets);
    parts.push(current);
    return parts;
}

function gPaths(x: unknown, to: 'primitives', p?: Path, visited?: Set<unknown>): Generator<[p: Path, v: Primitive]>;
function gPaths(x: unknown, to: 'objects', p?: Path, visited?: Set<unknown>): Generator<[p: Path, v: object]>;
function gPaths(
    x: unknown,
    to: 'primitives' | 'objects',
    p: Path,
    visited?: Set<unknown>,
): Generator<[p: Path, v: unknown]>;
function* gPaths(
    x: unknown,
    to: 'primitives' | 'objects',
    p: Path = [],
    visited = new Set<unknown>(),
): Generator<[p: Path, v: unknown]> {
    if (isBag(x)) visited.add(x);
    for (const [k, v] of gChildren(x)) {
        if (visited.has(v)) throw new Error(`cycle detected ${k} ${v}`);
        yield* gPaths(v, to, [...p, k], visited);
    }
    if ((to === 'objects') === isBag(x)) {
        yield [p, x];
    }
}

function stringify(x: unknown) {
    return isEmpty(x) ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x);
}

function follow(path: Readonly<Path>, x: unknown): unknown {
    let item: any = x;
    for (let i = 0; i < path.length && !isEmpty(item); item = item[path[i++]]) {}
    return item;
}

function isEmpty(x: unknown) {
    return x === undefined || x === '' || x === null;
}

/** is this value a proper container of other values? */
function isBag(x: unknown): x is object | Function {
    return ((typeof x === 'object' && x !== null) || typeof x === 'function') && hasKeys(x);
}
function hasKeys(x: object) {
    for (const _ in x) {
        return true;
    }
    return false;
}

function* gChildren(x: unknown): Generator<[k: Path[number], v: unknown]> {
    if (!isBag(x)) return;
    yield* Object.entries(x);
}

/** remove duplicates, preserve order */
function removeDuplicates<T extends Primitive>(arr: T[]): T[] {
    const seen = new Set(arr);
    return arr.filter(item => seen.delete(item));
}
