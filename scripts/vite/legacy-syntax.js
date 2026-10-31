import { transformAsync } from "@babel/core";
import presetEnv from "@babel/preset-env";
import rewritePattern from "regexpu-core";

// Regenerator cannot lower yield expressions embedded in some ES2015 expressions
// (including templates and spread). Lower those expressions before plugin-legacy
// transforms generators. This pass never touches the modern output or workers.
export default function legacySyntax() {
  return {
    name: "legacy-syntax",
    enforce: "pre",
    async renderChunk(code, chunk) {
      if (!chunk.fileName.includes("-legacy")) return null;
      const result = await transformAsync(code, {
        babelrc: false,
        configFile: false,
        compact: true,
        // Run the plugins below in their own pass, before preset-env rewrites
        // template literals into `.concat()` calls that `evaluate()` can't fold.
        passPerPreset: true,
        // Keep unused BigInt code parseable on engines without BigInt syntax.
        // Executing that code still requires native BigInt and can fail normally.
        plugins: [
          ({ types }) => ({
            visitor: {
              BigIntLiteral(path) {
                path.replaceWith(
                  types.callExpression(types.identifier("BigInt"), [
                    types.stringLiteral(path.node.value.replaceAll("_", "")),
                  ]),
                );
              },
              // Babel only lowers `u` on regex literals. Some dependencies (js-yaml)
              // build `RegExp(pattern, "u")` at module load from constant strings,
              // which throws on engines without the flag and takes the chunk down.
              "CallExpression|NewExpression"(path) {
                const [pattern, flags] = path.get("arguments");
                if (!types.isIdentifier(path.node.callee, { name: "RegExp" }) || !flags) return;
                const flagValue = flags.evaluate();
                if (!flagValue.confident || !flagValue.value.includes("u")) return;
                const patternValue = pattern.evaluate();
                if (!patternValue.confident) return;
                path.replaceWith(
                  types.newExpression(types.identifier("RegExp"), [
                    types.stringLiteral(
                      rewritePattern(patternValue.value, flagValue.value, {
                        unicodeFlag: "transform",
                      }),
                    ),
                    types.stringLiteral(flagValue.value.replace("u", "")),
                  ]),
                );
              },
            },
          }),
        ],
        presets: [
          [
            presetEnv,
            {
              targets: { ie: "11" },
              modules: false,
              exclude: [
                "transform-regenerator",
                "transform-async-to-generator",
                "transform-async-generator-functions",
              ],
            },
          ],
        ],
      });
      return result && { code: result.code, map: null };
    },
  };
}
