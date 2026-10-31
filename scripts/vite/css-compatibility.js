// Preserve modern declarations while providing usable values to older CSS engines.
export default function cssCompatibility() {
  return {
    postcssPlugin: "convert-css-compatibility",
    Declaration(decl) {
      if (decl.prop === "gap") {
        decl.cloneBefore({ prop: "--compat-gap" });
      }
      if (decl.prop === "display" && /^(inline-)?flex$/.test(decl.value)) {
        decl.cloneBefore({ prop: "--compat-gap", value: "0px" });
      }
      if (decl.value.includes("clamp(")) {
        const value = decl.value.replace(/clamp\(([^,]+),[^,]+,[^)]+\)/g, "$1");
        if (value !== decl.value) decl.cloneBefore({ value });
      }
      if (decl.value.includes("dvh")) {
        decl.cloneBefore({ value: decl.value.replaceAll("dvh", "vh") });
      }
    },
  };
}
