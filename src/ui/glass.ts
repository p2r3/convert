import { LiquidGlass } from "built/liquid-glass-ui/src/liquid-glass.js";

/** How much further red bends than green, and green than blue, as a share of the displacement. */
const DISPERSION = 0.15;

// feColorMatrix rows that keep one colour channel, with how far that channel is displaced
const CHANNELS = [
  ["r", "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", 1 + DISPERSION],
  ["g", "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", 1],
  ["b", "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0", 1 - DISPERSION],
] as const;

/**
 * The pane of LiquidGlass UI, with two changes to how it bends what is behind it.
 * It bends first and frosts second, because a bend applied to an already blurred backdrop
 * cannot be seen. And it bends each colour by a different amount, which leaves the faint
 * colour fringe of real glass at the edges (the dispersion of liquid-glass-studio, done
 * here in the SVG filter instead of a shader).
 */
class DispersiveGlass extends LiquidGlass {
  styles() {
    const filters =
      "var(--_refract) blur(var(--lg-blur)) saturate(var(--lg-saturate)) brightness(var(--lg-brightness))";
    return `${super.styles()}
      .lg--refract { -webkit-backdrop-filter: ${filters}; backdrop-filter: ${filters}; }`;
  }

  render() {
    super.render();
    // absent where the library left refraction out: outside Chromium, or without the attribute
    const map = this.shadowRoot?.querySelector("feDisplacementMap");
    if (!map) return;
    const scale = Number(map.getAttribute("scale"));
    map.outerHTML =
      CHANNELS.map(
        ([name, matrix, factor]) =>
          `<feDisplacementMap in="SourceGraphic" in2="smap" scale="${scale * factor}"
             xChannelSelector="R" yChannelSelector="B" result="bent-${name}"/>
           <feColorMatrix in="bent-${name}" type="matrix" values="${matrix}" result="${name}"/>`,
      ).join("") +
      `<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/>`;
  }
}

customElements.define("dispersive-glass", DispersiveGlass);
