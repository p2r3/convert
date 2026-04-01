import { PopupData } from "src/ui"
import { popupOpen } from "src/ui/PopupStore"
import { HelpCircle } from "lucide-preact"
import tippy from "tippy.js"
import { useEffect, useRef } from "preact/hooks"
import StyledButton from "src/ui/components/StyledButton"

export default function HelpButton() {
	const btnRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!btnRef.current) return;
		const instance = tippy(btnRef.current, {
			content: "Learn more about the converter!",
			placement: "bottom",
			delay: [300, 0],
		});
		return () => instance.destroy();
	}, []);

	const onHelpClick = () => {
		PopupData.value = {
			dismissible: true,
			buttonText: "Got it"
		}
		PopupData.value.contents = (
			<div className="help-content">
				<h1>Convert to it!</h1>
				<p className="help-subtitle">Truly universal on-device file converter.</p>

				<div className="help-section">
					<h2>Why use this?</h2>
					<p>Most online converters require uploading your files to a server — that's terrible for privacy. This app runs entirely in your browser. Your files never leave your device.</p>
					<p>It also converts across mediums. Video to PDF? Audio to image? If there's a path, it'll find it.</p>
				</div>

				<div className="help-section">
					<h2>How to use</h2>
					<ol>
						<li>Upload your file by clicking or dragging it in.</li>
						<li>Confirm the input format (auto-detected).</li>
						<li>Choose your desired output format.</li>
						<li>Click <strong>Convert</strong> and wait for the result.</li>
					</ol>
				</div>

				<div className="help-section">
					<h2>Advanced mode</h2>
					<p>Advanced mode reveals additional conversion methods and plugin details for each format. Use it when you need fine-grained control over which tool handles the conversion.</p>
				</div>
			</div>
		)
		popupOpen.value = true
	}

	return (
		<StyledButton
			buttonRef={btnRef}
			onClick={onHelpClick}
			icon={<HelpCircle size={16} />}
		>
			Help
		</StyledButton>
	);
}
