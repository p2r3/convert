import { PopupData } from "src/ui"
import { popupOpen } from "src/ui/PopupStore"
import StyledButton, { ButtonVariant } from "src/ui/components/StyledButton"

export default function HelpButton() {
	const onHelpClick = (ev: preact.TargetedMouseEvent<HTMLButtonElement>) => {
		PopupData.value = {
			dismissible: true,
			buttonText: "OK"
		}
		PopupData.value.contents = (
			<>
				<h1>Help</h1>
				<p><b>Truly universal online file converter.</b></p>
				<p>Many online file conversion tools are <b>boring</b> and <b>insecure</b>. They only allow conversion between two formats in the same medium (images to images, videos to videos, etc.), and they require that you <i>upload your files to some server</i>.</p>
				<p>This is not just terrible for privacy, it's also incredibly lame. What if you <i>really</i> need to convert an AVI video to a PDF document? Try to find an online tool for that, I dare you.</p>
				<p>Convert.to.it aims to be a tool that "just works". You're almost <i>guaranteed</i> to get an output - perhaps not always the one you expected, but it'll try its best to not leave you hanging.</p>
				<h2>Usage</h2>
				<ol>
					<li>Upload your file using the file browser, or drag and drop your file.</li>
					<li>Select an output format.</li>
					<li>Click <b>Convert!</b></li>
					<li>Hopefully, after a bit (or a lot) of thinking, the program will spit out the file you wanted.</li>
				</ol>
				<h2>Advanced mode</h2>
				<p>Advanced mode exposes additional conversion methods for some file types. If you do not intend on using a specific conversion method, it's better to leave it in Simple mode.</p>
			</>
		)
		popupOpen.value = true
	}

	return (
		<StyledButton
			variant={ ButtonVariant.Default }
			onClick={ onHelpClick }
			tabIndex={ 2 }
		>Help</StyledButton>
	)
}
