import type { TargetedMouseEvent } from "preact";
import { useSignalEffect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { popupOpen, closePopup } from "src/ui/PopupStore";

import "./index.css";
import { PopupData } from "../../AppState";

// Where to return focus when the popup closes. The opener is preferred, but
// flows like Conversion unmount it mid-flow, so a detached opener falls back
// to an enabled button with the same label.
function resolveRestoreTarget(saved: HTMLElement | null): HTMLElement | null {
  if (saved && saved.isConnected && typeof saved.focus === "function") return saved;
  const label = saved?.textContent?.trim();
  if (!label) return null;
  for (const el of Array.from(document.querySelectorAll("button"))) {
    const btn = el as HTMLButtonElement;
    if (!btn.disabled && btn.textContent?.trim() === label) return btn;
  }
  return null;
}

export default function Popup() {
  const ref = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useSignalEffect(() => {
    const elem = ref.current!;
    if (popupOpen.value) {
      previousFocus.current = (document.activeElement as HTMLElement) ?? null;
      if (!elem.open) elem.showModal();
    } else {
      if (elem.open) elem.close();
      // Restore focus to the element that opened the popup (accessibility).
      // Flows like Conversion unmount the opener mid-flow (the listing is
      // replaced by a loading screen), so a detached opener falls back to an
      // enabled button with the same label.
      const target = resolveRestoreTarget(previousFocus.current);
      if (target) {
        // Defer so the dialog has fully closed before refocusing.
        requestAnimationFrame(() => target.focus());
      }
      previousFocus.current = null;
    }
  });

  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") ev.preventDefault();
      if (
        ev.key === "Escape" &&
        (typeof PopupData.value.dismissible === "undefined" || PopupData.value.dismissible)
      )
        closePopup();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const clickHandler = (ev: TargetedMouseEvent<HTMLDialogElement>) => {
    const elem = ref.current!;
    const rect = elem.getBoundingClientRect();
    const isInside =
      rect.top <= ev.clientY &&
      ev.clientY <= rect.top + rect.height &&
      rect.left <= ev.clientX &&
      ev.clientX <= rect.left + rect.width;

    if (!isInside && PopupData.value.dismissible) closePopup();
  };

  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const handleButtonClick = () => {
    if (typeof PopupData.value.buttonOnClick === "function") {
      PopupData.value.buttonOnClick({} as any);
    } else {
      closePopup();
    }
  };

  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const getPopupContents = () => {
    if (PopupData.value.contents) return PopupData.value.contents;
    return (
      <>
        <h1>{PopupData.value.title}</h1>
        <p>{PopupData.value.text}</p>
      </>
    );
  };

  return (
    <dialog id="popup" ref={ref} onClick={clickHandler}>
      {getPopupContents()}
      {PopupData.value.buttonText && (
        <button onClick={handleButtonClick}>{PopupData.value.buttonText}</button>
      )}
    </dialog>
  );
}
