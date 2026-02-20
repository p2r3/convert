/** @type {AudioContext | undefined} */
let ac;

let sfontBin;
let musicBin;
let synth;
let sfontId;
let musicLoaded = false;
let lastSFontIsDefault = false;
let playingStatus = 'Stopped';

function getFormInput(name) {
	return document.getElementById('DataSelector').elements[name];
}

async function loadBinary(url) {
	const resp = await fetch(url);
	return await resp.arrayBuffer();
}

async function loadBinaryFromFile(input) {
	if (input.files.length === 0) {
		return null;
	}
	const file = input.files[0];
	return await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result);
		reader.onerror = () => reject(new Error('Unable to read'));
		reader.readAsArrayBuffer(file);
	});
}

async function loadDefaultSFont() {
	if (sfontBin) {
		return sfontBin;
	}
	const buff = await loadBinary('ChoriumRevA.sf2');
	sfontBin = buff;
	return buff;
}

async function loadDefaultMusic() {
	if (musicBin) {
		return musicBin;
	}
	const buff = await loadBinary('Tinkle.mid');
	musicBin = buff;
	return buff;
}

function loadSFont(useDefaultSFont) {
	return useDefaultSFont
		? loadDefaultSFont()
		: loadBinaryFromFile(getFormInput('DataSoundfontInput'))
			.then(
				// if soundfont is not selected, use default
				(bin) => bin || loadDefaultSFont()
			);
}

function loadMusic(useDefaultMusic) {
	return useDefaultMusic
		? loadDefaultMusic()
		: loadBinaryFromFile(getFormInput('DataSMFFileInput'))
			.then(
				// if SMF file is not selected, use default
				(bin) => bin || loadDefaultMusic()
			);
}

async function initializeSynthesizer(useDefaultSFont) {
	if (synth && useDefaultSFont) {
		return synth;
	}

	// Load Soundfont binary asynchronously
	const promiseSFont = loadSFont(useDefaultSFont);
	lastSFontIsDefault = useDefaultSFont;

	if (!ac) {
		ac = new AudioContext();
	}

	if (synth) {
		await synth.unloadSFontAsync(sfontId);
	} else {
		// Initialize AudioWorklet
		await ac.audioWorklet.addModule('../lib/libfluidsynth-2.4.6.js');
		await ac.audioWorklet.addModule('../lib/js-synthesizer.worklet.min.js');

		// Create the synthesizer instance for AudioWorkletNode
		synth = new JSSynth.AudioWorkletNodeSynthesizer();
		synth.init(ac.sampleRate);
		const node = synth.createAudioNode(ac);
		node.connect(ac.destination);
	}

	// Load binaries
	const sfontBin = await promiseSFont;

	// Load SoundFont data to the synthesizer
	sfontId = await synth.loadSFont(sfontBin);
		
	return synth;
}

function setPlayingStatus(status) {
	document.getElementById('PlayingStatus').innerText = status;
	playingStatus = status;
}

async function doPlay() {
	const useDefaultSFont = getFormInput('DataSoundfontSelect').value === 'default';
	const useDefaultMusic = getFormInput('DataSMFFileSelect').value === 'default';

	setPlayingStatus('Preparing');

	const [synth, musicBin] = await Promise.all([
		// Initialize the synthesizer
		initializeSynthesizer(useDefaultSFont),
		// Load SMF file binary
		loadMusic(useDefaultMusic)
	]);

	// Load SMF file data to the synthesizer
	await synth.addSMFDataToPlayer(musicBin);

	// Play the loaded SMF data
	await synth.playPlayer();

	setPlayingStatus('Playing');

	// Wait for finishing playing
	await synth.waitForPlayerStopped();

	// Wait for all voices stopped
	await synth.waitForVoicesStopped();

	// Reset synthesizer (release loaded SMF data)
	await synth.resetPlayer();

	setPlayingStatus('Stopped');
}

function playMusic() {
	if (playingStatus === 'Playing') {
		synth.stopPlayer();
	} else if (playingStatus === 'Stopped') {
		doPlay();
	}
}

// for UX
function initializeFormInput() {
	const DataSoundfontSelect = getFormInput('DataSoundfontSelect');
	const DataSoundfontInput = getFormInput('DataSoundfontInput');
	DataSoundfontInput.addEventListener('change', () => { DataSoundfontSelect.value = 'file'; }, false);

	const DataSMFFileSelect = getFormInput('DataSMFFileSelect');
	const DataSMFFileInput = getFormInput('DataSMFFileInput');
	DataSMFFileInput.addEventListener('change', () => { DataSMFFileSelect.value = 'file'; }, false);
}
initializeFormInput();
