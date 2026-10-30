import { signal } from "@preact/signals";

export interface PopupDataContainer {
  /** Title of the popup */
  title?: string;
  /** The description text of the popup */
  text?: string;
  /**
   * Is the popup soft-dismissible?
   *
   * If this is false, the modal must be closed programmatically, or else it'll be stuck blocking input
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog#popover_api_html_attributes
   */
  dismissible?: boolean;
  /** Text for the button. If this is undefined, the popup will hide the button */
  buttonText?: string;
  /** The event handler for the button. If this is just `true`, clicking the button will close the modal */
  buttonOnClick?: preact.MouseEventHandler<HTMLButtonElement> | true;
  /**
   * Raw contents of the popup. Can be any arbitrary JSX data.
   *
   * If this is declared, properties `title` and `text` are ignored
   */
  contents?: preact.JSX.Element;
  /** Extra class name for the popup element, for popups that need their own sizing */
  className?: string;
}

export const popupOpen = signal(false);

type FocusTarget = () => HTMLElement | null;
let returnFocus: FocusTarget | undefined;

export const openPopup = (target?: FocusTarget) => {
  if (!popupOpen.value) {
    const opener = document.activeElement;
    returnFocus = target ?? (() => (opener instanceof HTMLElement ? opener : null));
  }
  popupOpen.value = true;
};
export const closePopup = () => (popupOpen.value = false);
export const restorePopupFocus = () => {
  if (popupOpen.peek()) return;
  const target = returnFocus?.();
  returnFocus = undefined;
  if (target?.isConnected) target.focus();
};
export const togglePopup = () => (popupOpen.value ? closePopup() : openPopup());

// Manual overrides
// @ts-expect-error
window.openPopup = openPopup;
// @ts-expect-error
window.closePopup = closePopup;
// @ts-expect-error
window.togglePopup = togglePopup;
