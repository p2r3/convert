import { useRef, useState } from 'preact/hooks';

import { CurrentPage, Pages } from '../../index';
import { SelectedFiles } from 'src/main.new';

import uploadImage from '../../img/fa-upload-solid-full.svg';
import logoImage from '../../img/logo.svg';

import DarkModeToggle from '../DarkModeToggle';
import { Icon } from "../Icon";
import StyledButton from "../StyledButton";

import './UploadField.css'

import AdvancedModeToggle from '../AdvancedModeToggle';
import HelpButton from '../HelpButton';

interface UploadFieldComponentProps {
	disabled?: boolean
}

export default function UploadField({ disabled = false }: UploadFieldComponentProps) {
	const [isDisabled, setIsDisabled] = useState(disabled);
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
		setIsDisabled(true);
		const files = fileRef.current?.files;

		// Check if files uploaded were empty
		if (
			!files
			|| files.length === 0
		) return

		// Map array item to object format
		for (const file of files) {
			SelectedFiles.value[`${file.name}-${file.lastModified}`] = file
		}

		CurrentPage.value = Pages.Conversion;
	}

	return (
		<div class={ `upload-field ${isDisabled ? 'upload-field-disabled' : null}` }>
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
						multiple
					/>
					<div className="upload-card-dropzone-icon-container">
						<Icon src={ uploadImage } size={ 40 } color="var(--primary)" />
					</div>
					<StyledButton variant="primary" tabIndex={ 1 }>Click to add your file</StyledButton>
					<span className="upload-card-dropzone-subtext">or drag and drop here</span>
				</div>

				<div className="upload-card-buttons">
					<AdvancedModeToggle compact={ false } />
					<HelpButton />
				</div>

			</div>
		</div>
	)
}
