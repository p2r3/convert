import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";
import tippy from "tippy.js";
import "tippy.js/dist/tippy.css";

/** Shows `content` in a tooltip below the referenced element. */
export default function useTooltip(ref: RefObject<Element | null>, content: string) {
  useEffect(() => {
    if (!ref.current) return undefined;
    const instance = tippy(ref.current, { content, placement: "bottom", delay: [300, 0] });
    return () => instance.destroy();
  }, [ref, content]);
}
