import { useRef, useState } from 'preact/hooks'

import uploadImage from '../img/fa-upload-solid-full.svg';
import logoImage from '../../../favicon.ico';

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
		console.debug(fileRef.current?.files);
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

	return (
		<div class="upload-field">
			<div class="upload-card">

				<div class="upload-card-header">
					<h1>
						<img class="upload-card-logo" src={ logoImage } alt="Logo" />
						<span class="upload-card-title">Convert to it!</span>
					</h1>
					<div class="upload-card-theme-toggle"></div>
				</div>

				<div
					class={ (isDragging ? "active-drag" : "").concat(" upload-card-dropzone-hint") }
					onClick={ handleClick }
					onDrop={ handleDrop }
					onDragOver={ handleDragOver }
					onDragEnter={ handleDragEnter }
					onDragLeave={ handleDragLeave }
				>
					<input
						ref={ fileRef }
						type="file"
						name="uploadFile"
						id="uploadFile"
						// prevent synthetic click from retriggering
						// the dropzone's onclick handler
						onClick={ (ev) => ev.stopPropagation() }
						tabIndex={ 0 }
					/>
					<div className="upload-card-dropzone-icon-container">
						<img class="upload-card-dropzone-icon" src={ uploadImage } alt="Upload" />
					</div>
					<button class="upload-card-dropzone-button">Click to add your file</button>
					<span className="upload-card-dropzone-subtext">or drag and drop here</span>
				</div>

				<div class="upload-card-buttons">
					<button className="upload-card-button-advanced-mode">Advanced mode</button>
					<button className="upload-card-button-help">Help</button>
				</div>

			</div>
		</div>
	)
}
