import { useSignalEffect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { popupOpen, closePopup, restorePopupFocus } from "src/ui/PopupStore";

import "./index.css";
import { PopupData } from "src/ui/AppState";
import { type TargetedMouseEvent } from "preact";

const isDismissible = () => PopupData.value.dismissible !== false;

const cancelHandler = (ev: Event) => {
  if (!isDismissible()) ev.preventDefault();
};
const closeHandler = () => {
  if (!popupOpen.peek()) return;
  closePopup();
  requestAnimationFrame(restorePopupFocus);
};

const clickHandler = (ev: TargetedMouseEvent<HTMLDialogElement>) => {
  if (ev.target !== ev.currentTarget) return;
  const rect = ev.currentTarget.getBoundingClientRect();
  const isInside =
    rect.top <= ev.clientY &&
    ev.clientY <= rect.top + rect.height &&
    rect.left <= ev.clientX &&
    ev.clientX <= rect.left + rect.width;

  if (!isInside && isDismissible()) closePopup();
};

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
      if (ev.key === "Escape" && isDismissible()) closePopup();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const handleButtonClick = (event: TargetedMouseEvent<HTMLButtonElement>) => {
    if (typeof PopupData.value.buttonOnClick === "function") {
      PopupData.value.buttonOnClick(event);
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
    <dialog
      id="popup"
      className={PopupData.value.className}
      ref={ref}
      onClick={clickHandler}
      onCancel={cancelHandler}
      onClose={closeHandler}
    >
      {getPopupContents()}
      {PopupData.value.buttonText && (
        <button onClick={handleButtonClick}>{PopupData.value.buttonText}</button>
      )}
    </dialog>
  );
}
