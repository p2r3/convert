import { useRef, useState } from 'preact/hooks';

import { CurrentPage, Pages } from '../../index';
import { selectedFiles } from 'src/main';

import uploadImage from '../../img/fa-upload-solid-full.svg';
import logoImage from '../../img/logo.svg';

import DarkModeToggle from '../DarkModeToggle.tsx';
import { Icon } from "../Icon.tsx";

import './UploadField.css'


interface UploadFieldComponentProps {
	disabled?: boolean
}

export default function UploadField({ disabled = false }: UploadFieldComponentProps) {
	const [isDragging, setIsDragging] = useState(false);
	const dragCounter = useRef<number>(0);

	const fileRef = useRef<HTMLInputElement>(null);

	const handleClick = (ev: MouseEvent) => {
		ev.preventDefault();
		fileRef.current?.click();
	}

	const handleDrop = (ev: DragEvent) => {
		ev.preventDefault();
		console.debug(ev.dataTransfer?.files);
	}

	const handleDragEnter = (ev: DragEvent) => {
		ev.preventDefault();
		dragCounter.current++;
		if (ev.dataTransfer?.types.includes('Files')) setIsDragging(true);
	}

	const handleDragLeave = (ev: DragEvent) => {
		ev.preventDefault();
		dragCounter.current--;
		if (dragCounter.current == 0) setIsDragging(false);
	}

	const handleDragOver = (ev: DragEvent) => {
		ev.preventDefault()

	}

	const handleChange = (_ev: preact.TargetedEvent<HTMLInputElement, Event>) => {
		const files = fileRef.current?.files;
		// check if files uploaded were empty
		if (
			!files
			|| files.length === 0
		) return

		selectedFiles.push(...files);
		CurrentPage.value = Pages.Conversion;
	}

	return (
		<div class="upload-field">
			<div className="upload-card">

				<div className="upload-card-header">
					<h1>
						<Icon
							src={ logoImage }
							size={ 60 }
							color="var(--primary)"
							className="upload-card-logo"
						/>
						<span className="upload-card-title">Convert to it!</span>
					</h1>
					<div className="upload-card-theme-toggle">
						<DarkModeToggle />
					</div>
				</div>

				<div
					className={ (isDragging ? "active-drag" : "").concat(" upload-card-dropzone-hint") }
					onClick={ handleClick }
					onDrop={ handleDrop }
					onDragOver={ handleDragOver }
					onDragEnter={ handleDragEnter }
					onDragLeave={ handleDragLeave }
					onChange={ handleChange }
				>
					<input
						ref={ fileRef }
						type="file"
						name="uploadFile"
						id="uploadFile"
						onClick={ (ev) => ev.stopPropagation() }
						tabIndex={ 0 }
					/>
					<div className="upload-card-dropzone-icon-container">
						<Icon src={ uploadImage } size={ 40 } color="var(--primary)" />
					</div>
					<button className="upload-card-dropzone-button">Click to add your file</button>
					<span className="upload-card-dropzone-subtext">or drag and drop here</span>
				</div>

				<div className="upload-card-buttons">
					<button className="button">Advanced mode</button>
					<button className="button">Help</button>
				</div>

			</div>
		</div>
	)
}
