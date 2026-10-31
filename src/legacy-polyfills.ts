import "core-js/actual";
import "whatwg-fetch";
import "fast-text-encoding";
import * as streams from "web-streams-polyfill/es5";

// plugin-legacy bundles this entry separately, without Babel. Keep it ES5.
// oxlint-disable-next-line no-var
for (var name in streams) {
  if (!(name in globalThis)) {
    Object.defineProperty(globalThis, name, {
      value: streams[name as keyof typeof streams],
      configurable: true,
      writable: true,
    });
  }
}
