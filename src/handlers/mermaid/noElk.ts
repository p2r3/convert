// Stands in for elkjs, which mermaid loads only for diagrams that ask for `layout: elk` (the
// handler sets dagre as the default).
// elkjs is EPL-2.0, a copyleft licence, so it is kept out of the build (see vite.config.js).
export default function ELK(): never {
  throw new Error(
    'The ELK layout is not included in this converter. Remove "layout: elk" from the diagram.',
  );
}
