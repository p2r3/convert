export const hasModifier = (event: KeyboardEvent) =>
  event.isComposing || event.ctrlKey || event.altKey || event.metaKey;

interface RovingOptions {
  /** Wrap around at either end instead of stopping. */
  wrap?: boolean;
  /** Enables ArrowUp/ArrowDown, moving by this many items. */
  columns?: number;
}

const OFFSETS: Record<string, (index: number, length: number, columns: number) => number> = {
  ArrowRight: (index) => index + 1,
  ArrowLeft: (index) => index - 1,
  ArrowDown: (index, _, columns) => index + columns,
  ArrowUp: (index, _, columns) => index - columns,
  Home: () => 0,
  End: (_, length) => length - 1,
};

/**
 * Moves focus between `items` for arrow/Home/End keys.
 * Returns true if the key was handled (and its default prevented).
 */
export function moveFocus(
  event: KeyboardEvent,
  items: HTMLElement[],
  { wrap = false, columns }: RovingOptions = {},
): boolean {
  const offset = OFFSETS[event.key];
  if (!offset || hasModifier(event)) return false;
  if (columns === undefined && (event.key === "ArrowDown" || event.key === "ArrowUp")) return false;
  const index = items.findIndex((item) => item === event.target);
  if (index < 0) return false;

  const length = items.length;
  const next = offset(index, length, columns ?? 1);
  event.preventDefault();
  items[wrap ? (next + length) % length : Math.max(0, Math.min(length - 1, next))]?.focus();
  return true;
}
