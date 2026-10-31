/** Flex gap cannot be detected with CSS.supports: old engines accept grid gap. */
export function initCompatibilityLayout() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden";
  probe.appendChild(document.createElement("div"));
  probe.appendChild(document.createElement("div"));
  document.body.appendChild(probe);
  const supported = probe.scrollHeight === 1;
  probe.remove();
  if (supported) return;

  let queued = false;
  const previous = new Map<HTMLElement, { left: string; top: string }>();
  const update = () => {
    queued = false;
    for (const [child, margins] of previous) {
      child.style.marginLeft = margins.left;
      child.style.marginTop = margins.top;
    }
    previous.clear();
    for (const element of document.querySelectorAll<HTMLElement>("*")) {
      const style = getComputedStyle(element);
      if (style.display !== "flex" && style.display !== "inline-flex") continue;
      const gap = style.getPropertyValue("--compat-gap").trim();
      if (!gap || gap === "0px") continue;
      const column = style.flexDirection.startsWith("column");
      const children = Array.from(element.children).filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && getComputedStyle(child).display !== "none",
      );
      for (const child of children.slice(1)) {
        const margins = { left: child.style.marginLeft, top: child.style.marginTop };
        const computed = getComputedStyle(child);
        previous.set(child, margins);
        if (column) child.style.marginTop = `calc(${computed.marginTop} + ${gap})`;
        else child.style.marginLeft = `calc(${computed.marginLeft} + ${gap})`;
      }
    }
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", schedule);
  schedule();
}
