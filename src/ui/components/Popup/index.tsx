import type { TargetedMouseEvent } from "preact";
import { useSignalEffect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { popupOpen, closePopup, restorePopupFocus } from "src/ui/PopupStore";

import "./index.css";
import { PopupData } from "src/ui/AppState";

export default function Popup() {
  const ref = useRef<HTMLDialogElement>(null);

  useSignalEffect(() => {
    const elem = ref.current!;
    if (popupOpen.value) {
      if (!elem.open) elem.showModal();
    } else {
      if (elem.open) {
        elem.close();
        requestAnimationFrame(restorePopupFocus);
      }
    }
  });

  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (!popupOpen.peek()) return;
      // Other window key handlers (e.g. type-to-search) skip prevented events, so this
      // keeps Escape from also reaching the page behind the popup.
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
    <dialog id="popup" className={PopupData.value.className} ref={ref} onClick={clickHandler}>
      {getPopupContents()}
      {PopupData.value.buttonText && (
        <button onClick={handleButtonClick}>{PopupData.value.buttonText}</button>
      )}
    </dialog>
  );
}
