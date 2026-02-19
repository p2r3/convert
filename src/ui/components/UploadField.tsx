
import { useRef, useState } from 'preact/hooks'

import uploadImage from '../img/fa-upload-solid-full.svg';
import logoImage from '../img/logo.svg';

import DarkModeToggle from './DarkModeToggle';

import './UploadField.css'
import { UploadedFiles } from '..';

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

		UploadedFiles.value.push(...files);
	}

	return (
		<div class="upload-field">
			<div class="upload-card">

				<div class="upload-card-header">
					<h1>
						<span
							className="upload-card-logo"
							style={{WebkitMaskImage: `url(${logoImage})`, maskImage: `url(${logoImage})`}}
						></span>
						<span class="upload-card-title">Convert to it!</span>
					</h1>
					<div class="upload-card-theme-toggle">
						<DarkModeToggle />
					</div>
				</div>

				<div
					class={ (isDragging ? "active-drag" : "").concat(" upload-card-dropzone-hint") }
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
						// prevent synthetic click from retriggering
						// the dropzone's onclick handler
						onClick={ (ev) => ev.stopPropagation() }
						tabIndex={ 0 }
					/>
					<div className="upload-card-dropzone-icon-container">
						<div className="upload-card-dropzone-icon"></div>
					</div>
					<button class="upload-card-dropzone-button">Click to add your file</button>
					<span className="upload-card-dropzone-subtext">or drag and drop here</span>
				</div>

				<div class="upload-card-buttons">
					<button className="button">Advanced mode</button>
					<button className="button">Help</button>
				</div>

			</div>
		</div>
	)
}
