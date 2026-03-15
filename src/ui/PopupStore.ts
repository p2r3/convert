import { signal } from '@preact/signals'

export interface PopupDataContainer {
	/** Title of the popup */
	title?: string
	/** The description text of the popup */
	text?: string
	/**
	 * Is the popup soft-dismissible?
	 *
	 * If this is false, the modal must be closed programmatically, or else it'll be stuck blocking input
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog#popover_api_html_attributes
	 */
	dismissible?: boolean
	/** Text for the button. If this is undefined, the popup will hide the button */
	buttonText?: string
	/** The event handler for the button. If this is just `true`, clicking the button will close the modal */
	buttonOnClick?: preact.MouseEventHandler<HTMLButtonElement> | true
	/**
	 * Raw contents of the popup. Can be any arbitrary JSX data.
	 *
	 * If this is declared, properties `title` and `text` are ignored
	 */
	contents?: preact.JSX.Element
}

export const popupOpen = signal(false);

export const openPopup = () => (popupOpen.value = true);
export const closePopup = () => (popupOpen.value = false);
export const togglePopup = () => (popupOpen.value = !popupOpen.value);

// Manual overrides
// @ts-expect-error
window.openPopup = openPopup;
// @ts-expect-error
window.closePopup = closePopup;
// @ts-expect-error
window.togglePopup = togglePopup;
