import * as THREE from "three";
import { Vector3, Quaternion, Mesh } from "three";

import * as BSOR from "./replay.ts";

export async function render(replay: BSOR.Replay, width: number, height: number, onFrame: (renderer: THREE.WebGLRenderer) => Promise<void>, onDone: () => Promise<void>) {
	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);

	const renderer = new THREE.WebGLRenderer();
	renderer.setSize(width, height);

	const frames = [...replay.frames].sort((a, b) => a.time - b.time);
	let frameIndex = 0;
	const noteEvents = [...replay.notes].sort((a, b) => a.time - b.time);
	let noteIndex = 0;
	const leftMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
	const rightMaterial = new THREE.MeshBasicMaterial({ color: 0x0080FF });
	const saberGeometry = new THREE.BoxGeometry(0.05, 1.25, 0.05).translate(0, 0.6, 0);
	class Saber {
		mesh: Mesh;

		constructor(material: THREE.Material) {
			this.mesh = new Mesh(saberGeometry, material)
			scene.add(this.mesh);
		}

		update(position: Vector3, rotation: Quaternion) {
			this.mesh.position.set(position.x, position.y, -position.z);
			this.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
			this.mesh.rotateX(Math.PI/2);
		}
	}
	const sabers = [
		new Saber(leftMaterial),
		new Saber(rightMaterial)
	];
	const TIME_SCALE = 20;
	const REACTION_TIME = 1;
	const NOTE_SCALE = 0.8;
	const ARROW_SIZE = NOTE_SCALE*0.75;
	const arrowGeometry = new THREE.BufferGeometry();
	arrowGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
		-ARROW_SIZE/2, 0, NOTE_SCALE*0.55,
		ARROW_SIZE/2, 0, NOTE_SCALE*0.55,
		0, NOTE_SCALE*0.4, NOTE_SCALE*0.55,
	]), 3));
	const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
	const noteGeometry = new THREE.BoxGeometry(NOTE_SCALE, NOTE_SCALE, NOTE_SCALE);
	const dotGeometry = new THREE.CircleGeometry(NOTE_SCALE*0.25).translate(0, 0, NOTE_SCALE*0.55);
	const bombGeometry = new THREE.SphereGeometry(NOTE_SCALE);
	const bombMaterial = new THREE.MeshBasicMaterial({ color: 0x808080 });
	class Note {
		data: BSOR.Note;
		bloq: THREE.Mesh;
		arrow: THREE.Mesh;
		removalQueued: boolean;

		constructor(data: BSOR.Note) {
			if(data.type == BSOR.CutType.BOMB) {
				this.bloq = new Mesh(bombGeometry, bombMaterial);
			}
			else {
				this.bloq = new Mesh(noteGeometry, data.color == BSOR.NoteColor.LEFT ? leftMaterial : rightMaterial);
			}
			if(data.cutDirection == BSOR.CutDirection.ANY) {
				this.arrow = new Mesh(dotGeometry, arrowMaterial);
			}
			else {
				this.arrow = new Mesh(arrowGeometry, arrowMaterial);
				this.arrow.position.set(0, -NOTE_SCALE*0.4, 0);
			}
			this.bloq.add(this.arrow);
			switch(data.cutDirection) {
				case BSOR.CutDirection.UP:
					break;
				case BSOR.CutDirection.DOWN:
					this.bloq.rotateZ(Math.PI);
					break;
				case BSOR.CutDirection.LEFT:
					this.bloq.rotateZ(Math.PI/2);
					break;
				case BSOR.CutDirection.RIGHT:
					this.bloq.rotateZ(-Math.PI/2);
					break;
				case BSOR.CutDirection.UP_LEFT:
					this.bloq.rotateZ(Math.PI*0.25);
					break;
				case BSOR.CutDirection.UP_RIGHT:
					this.bloq.rotateZ(-Math.PI*0.25);
					break;
				case BSOR.CutDirection.DOWN_LEFT:
					this.bloq.rotateZ(Math.PI*0.75);
					break;
				case BSOR.CutDirection.DOWN_RIGHT:
					this.bloq.rotateZ(-Math.PI*0.75);
					break;
				case BSOR.CutDirection.ANY:
					break;
				case BSOR.CutDirection.NONE:
					break;

			}
			this.data = data;
			this.removalQueued = false;
			scene.add(this.bloq);
		}
		update(time: number) {
			this.bloq.position.set(this.data.lineIndex-1.5, this.data.lineLayer, TIME_SCALE*(time-this.data.spawnTime));
			this.removalQueued = this.shouldRemove(time);
			if(this.removalQueued) {
				scene.remove(this.bloq);
			}
		}
		shouldRemove(time: number): boolean {
			if(this.data.type != BSOR.CutType.MISS) {
				return time >= this.data.time;
			}
			return this.data.spawnTime >= time-REACTION_TIME;
		}

	}
	let notes: Note[] = [];

	camera.position.z = 2;
	camera.position.y = 1.5;

  let time = 0;

  while(true) {
    time += 1/30;
		while(frameIndex < frames.length && frames[frameIndex].time <= time) {
			const frame = frames[frameIndex];
			frameIndex++;
      sabers[0].update(frame.leftHand.position, frame.leftHand.rotation);
      sabers[1].update(frame.rightHand.position, frame.rightHand.rotation);
		}
		while(noteIndex < noteEvents.length && noteEvents[noteIndex].time <= time+REACTION_TIME) {
			const note = noteEvents[noteIndex];
			notes.push(new Note(note));
			noteIndex++;
		}
		for(const note of notes) {
			note.update(time);
		}
		notes = notes.filter(n => !n.removalQueued);

		renderer.render(scene, camera);
		await onFrame(renderer);

		if(frameIndex >= frames.length) {
			// cleanup
			leftMaterial.dispose();
			rightMaterial.dispose();
			saberGeometry.dispose();
			arrowGeometry.dispose();
			arrowMaterial.dispose();
			noteGeometry.dispose();
			dotGeometry.dispose();
			bombGeometry.dispose();
			bombMaterial.dispose();
			// stop animation
			await onDone();
      break;
		}
	}
	// TODO: walls
}
