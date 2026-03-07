import { useSignalEffect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { popupOpen } from "../PopupStore";

import "./Popup.css";
import { PopupData } from "..";

export default function Popup() {
	const ref = useRef<HTMLDialogElement>(null);

	// Use vanilla JS APIs to control popup state
	useSignalEffect(() => {
		const elem = ref.current;

		if (!elem) {
			console.warn("Popup not present");
			return;
		}

		if (popupOpen.value) {
			if (!elem.open) elem.showModal();
		} else {
			if (elem.open) elem.close();
		}
	});

	// Listen to soft-dismiss events
	useEffect(() => {
		window.addEventListener("keydown", (ev: KeyboardEvent) => {
			if (ev.key == "Escape") ev.preventDefault();
			if (
				ev.key == "Escape"
				&& (typeof PopupData.value.dismissible === "undefined" || PopupData.value.dismissible)
			) popupOpen.value = false;
		})
	}, [])

	const getPopupContents = () => {
		return (PopupData.value.contents) ? PopupData.value.contents : (
			<>
				<h1>{ PopupData.value.title }</h1>
				<p>{ PopupData.value.text }</p>
			</>
		)
	}

	return (
		<dialog
			id="popup"
			ref={ ref }
		>
			{ getPopupContents() }
			{
				PopupData.value.buttonText &&
				<button onClick={
					() => {
						if (typeof PopupData.value.buttonOnClick === "function") {
							return PopupData.value.buttonOnClick
						} else {
							popupOpen.value = false
						}
					}
				}>{ PopupData.value.buttonText }</button>
			}
		</dialog>
	);
}
