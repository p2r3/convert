import type { TargetedMouseEvent } from "preact";
import { useSignalEffect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { popupOpen, closePopup } from "src/ui/PopupStore";

import "./index.css";
import { PopupData } from "src/ui";

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
      const target = previousFocus.current;
      if (target && typeof target.focus === "function") {
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
