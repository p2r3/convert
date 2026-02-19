import { Vector3, Quaternion } from "three";

// See BSOR specification for more info:
// https://github.com/BeatLeader/BS-Open-Replay

export interface Frame {
	time: number;
	fps: number;
	head: {
		position: Vector3,
		rotation: Quaternion
	};
	leftHand: {
		position: Vector3,
		rotation: Quaternion
	};
	rightHand: {
		position: Vector3,
		rotation: Quaternion
	};
}

export enum ScoringType {
	NORMAL = 0,
	IGNORE,
	NO_SCORE,
	NORMAL2 = 3, // ???
	SLIDER_HEAD,
	SLIDER_TAIL,
	BURST_SLIDER_HEAD,
	BURST_SLIDER_ELEMENT
}

export enum Saber {
	LEFT = 0,
	RIGHT = 1
}

export enum CutType {
	GOOD = 0,
	BAD,
	MISS,
	BOMB
}

export enum NoteColor {
	LEFT = 0,
	RIGHT = 1
}

export enum CutDirection {
	UP = 0,
	DOWN,
	LEFT,
	RIGHT,
	UP_LEFT,
	UP_RIGHT,
	DOWN_LEFT,
	DOWN_RIGHT,
	ANY,
	NONE
}

export interface NoteBase {
	scoringType: ScoringType;
	lineIndex: number;
	lineLayer: number;
	color: NoteColor;
	cutDirection: CutDirection;
	time: number;
	spawnTime: number;
}
export interface CutInfo {
	ok: {
		speed: boolean,
		direction: boolean,
		saberType: boolean
	};
	wasCutTooSoon: boolean;
	saber: {
		speed: number,
		dir: Vector3,
		type: Saber
	};
	cut: {
		timeDeviation: number,
		dirDeviation: number,
		point: Vector3,
		normal: Vector3,
		distanceToCenter: number,
		angle: number,
		beforeCutRating: number,
		afterCutRating: number
	};
}
export interface GoodCut extends NoteBase {
	type: CutType.GOOD;
	info: CutInfo;
}
export interface BadCut extends NoteBase {
	type: CutType.BAD;
	info: CutInfo;
}
export interface Miss extends NoteBase {
	type: CutType.MISS;
}
export interface Bomb extends NoteBase {
	type: CutType.BOMB;
}
export type Note = GoodCut | BadCut | Miss | Bomb;

export enum ObstacleType {
	FullHeight = 0,
	Top,
	Free
}

export interface Wall {
	lineIndex: number;
	type: ObstacleType;
	width: number;
	energy: number;
	time: number;
	spawnTime: number;
}

export interface Height {
	height: number;
	time: number;
}

export interface Pause {
	duration: BigInt;
	time: number;
}

/// A BSOR replay file
export class Replay {
	/// Version info
	version: {
		mod: string,
		game: string
	};
	/// Play start
	timestamp: Date;
	/// Player info
	player: {
		id: string,
		name: string,
		platform: string
	};
	/// Headset info
	headset: {
		trackingSystem: string,
		hmd: string,
		controller: string
	};
	/// Map info
	map: {
		hash: string,
		songName: string,
		mapper: string,
		difficulty: string
	};
	/// Play info
	play: {
		score: number;
		mode: string;
		environment: string;
		modifiers: string;
		jumpDistance: number;
		leftHanded: boolean;
		height: number;
	}
	/// Time info
	time: {
		start: number;
		fail: number;
		speed: number;
	}
	/// Frames
	frames: Frame[];
	/// Notes
	notes: Note[];
	/// Walls
	walls: Wall[];
	/// Height
	height: Height[];
	/// Pause
	pause: Pause[];

	constructor(data: Uint8Array) {
		let pos = 0;
		let buffer = new ArrayBuffer(4);
		const bufferF32 = new Float32Array(buffer);
		const bufferU8 = new Uint8Array(buffer);

		function raise(msg: string): never {
			throw new BSORError(msg);
		}

		function get(n: number): number {
			return data[n] ?? raise("Unexpected EOF");
		}

		function byte(): number {
			return get(pos++);
		}

		function int(): number {
			pos += 4;
			return (get(pos-4)) | (get(pos-3) << 8) | (get(pos-2) << 16) | (get(pos-1) << 24);
		}

		function long(): BigInt {
			const lower = int();
			const upper = int();
			return BigInt(upper)*BigInt("0x100000000") + BigInt(lower);
		}

		function float(): number {
			bufferU8[0] = byte();
			bufferU8[1] = byte();
			bufferU8[2] = byte();
			bufferU8[3] = byte();
			return bufferF32[0]!;
		}

		function bool(): boolean {
			return byte() != 0;
		}

		function string(): string {
			const length = int();
			pos += length;
			return new TextDecoder().decode(new Uint8Array(data.buffer, pos-length, length));
		}
		function vector(): Vector3 {
			return new Vector3(float(), float(), float());
		}
		function quaternion(): Quaternion {
			return new Quaternion(float(), float(), float(), float());
		}
		// magic number
		if(int() != 0x442D3D69)
			raise("Invalid magic number");
		if(byte() != 1)
			raise("Unknown BSOR version");
		if(byte() != 0)
			raise("Expected info structure start");
		this.version = {
			mod: string(),
			game: string()
		};
		this.timestamp = new Date(Number(string())*1000);
		this.player = {
			id: string(),
			name: string(),
			platform: string()
		};
		this.headset = {
			trackingSystem: string(),
			hmd: string(),
			controller: string()
		};
		this.map = {
			hash: string(),
			songName: string(),
			mapper: string(),
			difficulty: string()
		};
		this.play = {
			score: int(),
			mode: string(),
			environment: string(),
			modifiers: string(),
			jumpDistance: float(),
			leftHanded: bool(),
			height: float()
		};
		this.time = {
			start: float(),
			fail: float(),
			speed: float()
		};
		this.frames = [];
		if(byte() != 1)
			raise("Expected frame array start");
		const frameCount = int();
		for(let i = 0; i < frameCount; i++) {
			this.frames.push({
				time: float(),
				fps: int(),
				head: {
					position: vector(),
					rotation: quaternion()
				},
				leftHand: {
					position: vector(),
					rotation: quaternion()
				},
				rightHand: {
					position: vector(),
					rotation: quaternion()
				}
			});
		}
		if(byte() != 2)
			raise("Expected note array start");
		this.notes = [];
		const noteCount = int();
		for(let i = 0; i < noteCount; i++) {
			const id = int();
			const scoringType = Math.floor(id/10000);
			const lineIndex = Math.floor(id/1000)%10;
			const lineLayer = Math.floor(id/100)%10;
			const color = Math.floor(id/10)%10 as NoteColor;
			const cutDirection = id%10 as CutDirection;
			const time = float();
			const spawnTime = float();
			const type = int() as CutType;
			switch(type) {
				case CutType.MISS:
				case CutType.BOMB:
					this.notes.push({
						type,
						scoringType,
						lineIndex,
						lineLayer,
						color,
						cutDirection,
						time,
						spawnTime
					})
					break;
				case CutType.GOOD:
				case CutType.BAD:
					this.notes.push({
						type,
						scoringType,
						lineIndex,
						lineLayer,
						color,
						cutDirection,
						time,
						spawnTime,
						info: {
							ok: {
								speed: bool(),
								direction: bool(),
								saberType: bool(),
							},
							wasCutTooSoon: bool(),
							saber: {
								speed: float(),
								dir: vector(),
								type: int() as Saber
							},
							cut: {
								timeDeviation: float(),
								dirDeviation: float(),
								point: vector(),
								normal: vector(),
								distanceToCenter: float(),
								angle: float(),
								beforeCutRating: float(),
								afterCutRating: float()
							}
						}
					})
					break;
			}
		}
		this.walls = [];
		if(byte() != 3)
			raise("Expected wall array start");
		const wallCount = int();
		for(let i = 0; i < wallCount; i++) {
			const id = int();
			this.walls.push({
				lineIndex: Math.floor(id/100),
				type: Math.floor(id/10)%10 as ObstacleType,
				width: id%10,
				energy: float(),
				time: float(),
				spawnTime: float()
			})
		}
		this.height = [];
		if(byte() != 4)
			raise("Expected height array start");
		const heightCount = int();
		for(let i = 0; i < heightCount; i++) {
			this.height.push({
				height: float(),
				time: float()
			})
		}
		this.pause = [];
		if(byte() != 5)
			raise("Expected pause array start");
		const pauseCount = int();
		for(let i = 0; i < pauseCount; i++) {
			this.pause.push({
				duration: long(),
				time: float()
			})
		}

	}
}

class BSORError extends Error {
	constructor(msg: string) {
		super(msg);
	}
}
