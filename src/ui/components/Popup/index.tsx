import type { TargetedMouseEvent } from "preact";
import { useSignalEffect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { popupOpen } from "src/ui/PopupStore";

import "./index.css";
import { PopupData } from "src/ui";

export default function Popup() {
	const ref = useRef<HTMLDialogElement>(null);

	// Use vanilla JS APIs to control popup state
	useSignalEffect(() => {
		const elem = ref.current!;

		if (popupOpen.value) {
			if (!elem.open) elem.showModal();
		} else {
			if (elem.open) elem.close();
		}
	});

	// Listen to soft-dismiss events
	useEffect(() => {
		window.addEventListener("keydown", (ev: KeyboardEvent) => {
			if (ev.key === "Escape") ev.preventDefault();
			if (
				ev.key === "Escape"
				&& (typeof PopupData.value.dismissible === "undefined" || PopupData.value.dismissible)
			) popupOpen.value = false;
		})
	}, []);

	/** Handle clicks to the backdrop/outisde of the dialog */
	const clickHandler = (ev: TargetedMouseEvent<HTMLDialogElement>) => {
		const elem = ref.current!;
		const rect = elem.getBoundingClientRect();

		const isInside =
			rect.top <= ev.clientY
			&& ev.clientY <= rect.top + rect.height
			&& rect.left <= ev.clientX
			&& ev.clientX <= rect.left + rect.width;

		if (
			!isInside
			&& PopupData.value.dismissible
		) popupOpen.value = false;
	};

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
			onClick={ clickHandler }
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
