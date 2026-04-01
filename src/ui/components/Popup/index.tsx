import type { TargetedMouseEvent } from "preact";
import { useSignalEffect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { popupOpen, closePopup } from "src/ui/PopupStore";
import { PopupData } from "src/ui";
import StyledButton, { ButtonVariant, ButtonSize } from "src/ui/components/StyledButton";
import "./index.css";

export default function Popup() {
	const ref = useRef<HTMLDialogElement>(null);

	useSignalEffect(() => {
		const elem = ref.current!;
		if (popupOpen.value) {
			if (!elem.open) elem.showModal();
		} else if (elem.open) {
			elem.close();
		}
	});

	useEffect(() => {
		const handler = (ev: KeyboardEvent) => {
			if (ev.key !== "Escape" || !popupOpen.value) return;
			if (PopupData.value.dismissible === false) {
				ev.preventDefault();
				return;
			}
			closePopup();
		};
		globalThis.addEventListener("keydown", handler);
		return () => globalThis.removeEventListener("keydown", handler);
	}, []);

	const clickHandler = (ev: TargetedMouseEvent<HTMLDialogElement>) => {
		const elem = ref.current!;
		const rect = elem.getBoundingClientRect();
		const isInside =
			rect.top <= ev.clientY
			&& ev.clientY <= rect.top + rect.height
			&& rect.left <= ev.clientX
			&& ev.clientX <= rect.left + rect.width;

		if (!isInside && PopupData.value.dismissible) closePopup();
	};

	const handleButtonClick = () => {
		if (typeof PopupData.value.buttonOnClick === "function") {
			PopupData.value.buttonOnClick({} as any);
		} else {
			closePopup();
		}
	};

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
			<div className="popup-body">
				{getPopupContents()}
				{PopupData.value.buttonText && (
					<div className="popup-actions">
						<StyledButton 
							variant={ButtonVariant.Primary} 
							size={ButtonSize.Small}
							onClick={handleButtonClick}
						>
							{PopupData.value.buttonText}
						</StyledButton>
					</div>
				)}
			</div>
		</dialog>
	);
}
