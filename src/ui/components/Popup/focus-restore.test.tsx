import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { render } from "preact";

GlobalRegistrator.register();

const { default: Popup } = await import("src/ui/components/Popup/index.tsx");
const { popupOpen, openPopup, closePopup } = await import("src/ui/PopupStore.ts");
const { PopupData } = await import("src/ui/AppState.ts");

// @preact/signals schedules useSignalEffect re-runs through a
// requestAnimationFrame/timeout fallback, so signal updates need a real
// timer tick (not just rAF) before effects flush.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 80));
}

describe("Popup focus restore (issue #766)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    PopupData.value = { title: "T", text: "x", dismissible: true, buttonText: "OK" };
    popupOpen.value = false;
  });

  afterEach(() => {
    render(null, container);
    popupOpen.value = false;
  });

  it("restores focus to the opener when it is still mounted", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Convert";
    document.body.appendChild(opener);

    render(<Popup />, container);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    openPopup();
    await tick();

    closePopup();
    await tick();

    expect(document.activeElement).toBe(opener);
  });

  it("restores focus to an equivalent control when the opener unmounted mid-flow", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Convert";
    document.body.appendChild(opener);

    render(<Popup />, container);
    opener.focus();

    openPopup();
    await tick();

    // Conversion swaps the listing for a loading screen, unmounting the
    // opener, then remounts an equivalent Convert button.
    opener.remove();
    const replacement = document.createElement("button");
    replacement.textContent = "Convert";
    document.body.appendChild(replacement);

    closePopup();
    await tick();

    expect(document.activeElement).toBe(replacement);
  });

  it("leaves focus alone when there is nothing sensible to restore to", async () => {
    render(<Popup />, container);

    openPopup();
    await tick();

    closePopup();
    await tick();

    expect(document.activeElement).toBe(document.body);
  });
});
