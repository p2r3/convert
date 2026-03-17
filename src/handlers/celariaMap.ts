import { CelariaMap } from "celaria-formats/class/maps/CelariaMap.mjs"
import { EditableCelariaMap } from "celaria-formats/class/maps/EditableCelariaMap.mjs"
import { Barrier } from "celaria-formats/class/maps/objects/Barrier.mjs"
import { Block } from "celaria-formats/class/maps/objects/Block.mjs"
import { Instance } from "celaria-formats/class/maps/objects/Instance.mjs"
import { PlayerSpawnPoint } from "celaria-formats/class/maps/objects/PlayerSpawnPoint.mjs"
import { Sphere } from "celaria-formats/class/maps/objects/Sphere.mjs"
import { TutorialHologram } from "celaria-formats/class/maps/objects/TutorialHologram.mjs"
import type { FlatVector3, Vector3 } from "celaria-formats/types/data.mts"
import CommonFormats from "src/CommonFormats.ts"
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts"

class celariaMapHandler implements FormatHandler {
	public name: string = "celariaMap"
	public supportedFormats?: FileFormat[]
	public ready: boolean = false
	/**/
	async init() {
		this.supportedFormats = [
			{
				name: "Wavefront OBJ",
				format: "obj",
				extension: "obj",
				mime: "model/obj",
				from: false,
				to: true,
				internal: "obj",
				category: "model",
				lossless: false,
			},
			CommonFormats.JSON.builder("json").allowFrom(true).allowTo(true).markLossless(false),
			{
				name: "Editable Celaria Map",
				format: "ecmap",
				extension: "ecmap",
				mime: "application/x-editable-celaria-map",
				from: true,
				to: true,
				internal: "ecmap",
				category: "data",
				lossless: false,
			},
			{
				name: "Celaria Map",
				format: "cmap",
				extension: "cmap",
				mime: "application/x-celaria-map",
				from: true,
				to: false,
				internal: "cmap",
				category: "data",
				lossless: false,
			},
		]

		this.ready = true
	}

	async doConvert(inputFiles: FileData[], inputFormat: FileFormat, outputFormat: FileFormat): Promise<FileData[]> {
		return inputFiles.map((file) => {
			const baseName = file.name.replace(/\.[^.]+$/u, "") // lifted from json5 handler.
			if (inputFormat.internal === "ecmap") {
				const editableCelariaMap = EditableCelariaMap.parse(Buffer.from(file.bytes))
				if (outputFormat.internal === "json") {
					const object: PlainOldEditableCelariaMap = {
						mapType: "Editable Celaria map",
						instances: [],
						sunRotationHorizontal: editableCelariaMap.sunRotationHorizontal,
						sunRotationVertical: editableCelariaMap.sunRotationVertical,
						name: editableCelariaMap.name,
						previewCamera: editableCelariaMap.previewCamera,
					}
					object.instances = editableCelariaMap.instances.map((instance) => {
						switch (instance.instanceId) {
							case 0: // Block
								return {
									scale: instance.scale,
									type: instance.type,
									rotation: instance.rotation,
									instanceType: "Block",
									position: instance.position,
								}
							case 1: // Sphere
								return {
									instanceType: "Sphere",
									position: instance.position,
								}
							case 2: // Player spawn point
								return {
									rotation: instance.rotation,
									instanceType: "Spawn point",
									position: instance.position,
								}
							case 3: // Barrier (Wall)
							case 4: // Barrier (Floor)
								return {
									scale: instance.scale,
									rotation: instance.rotation,
									instanceType: "Barrier",
									position: instance.position,
								}
							case 128:
								return {
									scale: instance.scale,
									type: instance.type,
									instanceType: "Dummy",
									rotation: instance.rotation,
									position: instance.position,
								}
						}
					})
					return {
						name: `${baseName}.${outputFormat.extension}`,
						bytes: new TextEncoder().encode(JSON.stringify(object)),
					}
				}
				if (outputFormat.internal === "obj") {
					const modelBuilder = new ModelBuilder(editableCelariaMap.instances)
					modelBuilder.do()
					return {
						name: `${baseName}.${outputFormat.extension}`,
						bytes: new TextEncoder().encode(modelBuilder.toString()),
					}
				}
			}
			if (inputFormat.internal === "json") {
				const typedParsedObject = celariaMapHandler.determinePlainOldSerializedFormat(JSON.parse(new TextDecoder().decode(file.bytes)))
				if (!typedParsedObject) throw new Error("Can't handle unknown parsed object.")
				function putInstances(map: EditableCelariaMap | CelariaMap, plainOldInstances: AllPlainOldInstanceTypes[]) {
					map.instances = plainOldInstances.map((plainOldInstance) => {
						switch (plainOldInstance.instanceType) {
							case "Block":
								const block = new Block(plainOldInstance.type)
								block.position = plainOldInstance.position
								block.rotation = plainOldInstance.rotation
								block.scale = plainOldInstance.scale
								block.type = plainOldInstance.type
								return block
							case "Barrier":
								const barrier = new Barrier()
								barrier.position = plainOldInstance.position
								barrier.rotation = plainOldInstance.rotation
								barrier.scale = plainOldInstance.scale
								return barrier
							case "Spawn point":
								const playerSpawnPoint = new PlayerSpawnPoint()
								playerSpawnPoint.position = plainOldInstance.position
								playerSpawnPoint.rotation = plainOldInstance.rotation
								return playerSpawnPoint
							case "Dummy":
								const tutorialHologram = new TutorialHologram(plainOldInstance.type)
								tutorialHologram.scale = plainOldInstance.scale
								tutorialHologram.rotation = plainOldInstance.rotation
								tutorialHologram.position = plainOldInstance.position
								return tutorialHologram
							case "Sphere":
								const sphere = new Sphere()
								sphere.position = plainOldInstance.position
								return sphere
						}
					})
				}
				if (outputFormat.internal === "ecmap") {
					const editableCelariaMap = new EditableCelariaMap()
					putInstances(editableCelariaMap, typedParsedObject.instances)
					const suitableVersion = celariaMapHandler.determineSuitableVersion("ecmap", editableCelariaMap.instances)
					editableCelariaMap.previewCamera = typedParsedObject.previewCamera
					editableCelariaMap.name = typedParsedObject.name
					editableCelariaMap.sunRotationHorizontal = typedParsedObject.sunRotationHorizontal
					editableCelariaMap.sunRotationVertical = typedParsedObject.sunRotationVertical
					editableCelariaMap.instances.forEach((instance) => {
						if (instance.instanceId === 0 && instance.type === Block.types.checkpoint) editableCelariaMap.checkpointOrder.add(instance)
					})
					const goal = editableCelariaMap.instances.find((instance) => instance.instanceId === 0 && instance.type === Block.types.goal) as Block | undefined
					if (goal) editableCelariaMap.checkpointOrder.add(goal)
					return {
						name: `${baseName}.${outputFormat.extension}`,
						bytes: Uint8Array.from(editableCelariaMap.serialize(suitableVersion)),
					}
				}
			}
			if (inputFormat.internal === "cmap" && outputFormat.internal === "ecmap") {
				const celariaMap = CelariaMap.parse(Buffer.from(file.bytes))
				const editableCelariaMap = new EditableCelariaMap()
				editableCelariaMap.checkpointOrder = celariaMap.checkpointOrder
				editableCelariaMap.instances = celariaMap.instances
				editableCelariaMap.name = celariaMap.name
				editableCelariaMap.previewCamera = celariaMap.previewCamera
				editableCelariaMap.sunRotationHorizontal = celariaMap.sunRotationHorizontal
				editableCelariaMap.sunRotationVertical = celariaMap.sunRotationVertical
				const suitableVersion = celariaMapHandler.determineSuitableVersion("ecmap", editableCelariaMap.instances)
				return {
					name: `${baseName}.${outputFormat.extension}`,
					bytes: Uint8Array.from(editableCelariaMap.serialize(suitableVersion)),
				}
			}
			throw new Error("Unsupported input-output.")
		})
	}
	/** Determines what a plain old JavaScript object is _likely_ to be. I don't do strict validation. */
	static determinePlainOldSerializedFormat(plainOldObject: any): false | PlainOldEditableCelariaMap {
		if (typeof plainOldObject !== "object") return false
		if (Array.isArray(plainOldObject)) return false
		// Check what the object identifies itself.
		if (plainOldObject.mapType === "Editable Celaria map") return plainOldObject as PlainOldEditableCelariaMap
		if (plainOldObject.mapType === "Celaria map") throw new Error("Not implemented.")
		return false
	}
	/** Determine a version most suitable for compatibility based on the given {@link instances}. Prefers versions for the latest available free open alpha version. Otherwise uses latest commercial Steam release when encountering new objects like {@link Barrier}s. */
	static determineSuitableVersion(format: "ecmap" | "cmap", instances: Instance[]): number {
		const containsBarriers = instances.some((instance) => instance.instanceId == 3 || instance.instanceId == 4)
		if (format === "ecmap") {
			if (containsBarriers) {
				return 4
			} else {
				return 2
			}
		}
		throw new Error("Unsupported format.")
	}
}
/** I help build a Wavefront OBJ of a map. */
class ModelBuilder {
	objString: string
	vertexCount: number
	instances: AllInstanceTypes[]
	/**/
	constructor(instances: AllInstanceTypes[]) {
		this.objString = ""
		this.vertexCount = 1
		this.instances = instances
	}

	do() {
		this.instances
			.filter((instance) => instance.instanceId === 0)
			.forEach((block) => {
				this.appendBlock(block)
			})
	}

	appendBlock(instance: Block) {
		Object.values(ModelBuilder.directions).forEach((face) => {
			const radians = ModelBuilder.degreesToRadians(-instance.rotation)
			for (let i = 0; i < face.geometry.length / 3; i++) {
				const vertexOffset = i * 3
				;[face.geometry[vertexOffset], face.geometry[vertexOffset + 1], face.geometry[vertexOffset + 2]].forEach((vertex) => {
					const result = []
					// scale and offset from base cube geometry.
					const scaledVertex = vertex.map((vertexComponent, componentIndex) => (vertexComponent - 0.5) * instance.scale[componentIndex])
					// perform rotation
					result[0] = scaledVertex[0] * Math.cos(radians) - scaledVertex[1] * Math.sin(radians)
					result[1] = scaledVertex[0] * Math.sin(radians) + scaledVertex[1] * Math.cos(radians)
					result[2] = scaledVertex[2]
					// add vertex
					this.objString += `v ${result.map((vertexComponent, componentIndex) => vertexComponent + instance.position[componentIndex]).join(" ")}\n`
				})
				// add face definition
				this.objString += `f ${this.vertexCount}/${this.vertexCount} ${this.vertexCount + 1}/${this.vertexCount + 1} ${this.vertexCount + 2}/${this.vertexCount + 2}\n`
				this.vertexCount += 3
			}
		})
	}
	/** Solves the most curious mathematical problem. */
	static degreesToRadians(degrees: number) {
		const conversionConstant = 57.2957795
		return degrees / conversionConstant
	}

	toString() {
		return this.objString
	}
	static directions = {
		yNegative: {
			geometry: [
				[0, 0, 1],
				[0, 0, 0],
				[1, 0, 0],
				[1, 0, 1],
				[0, 0, 1],
				[1, 0, 0],
			],
			faceNormal: [0, -1, 0],
		},
		yPositive: {
			geometry: [
				[1, 1, 0],
				[0, 1, 0],
				[0, 1, 1],
				[1, 1, 1],
				[1, 1, 0],
				[0, 1, 1],
			],
			faceNormal: [0, 1, 0],
		},
		zNegative: {
			geometry: [
				[1, 0, 0],
				[0, 0, 0],
				[0, 1, 0],
				[1, 1, 0],
				[1, 0, 0],
				[0, 1, 0],
			],
			faceNormal: [0, 0, -1],
		},

		zPositive: {
			geometry: [
				[0, 0, 1],
				[1, 0, 1],
				[1, 1, 1],
				[0, 1, 1],
				[0, 0, 1],
				[1, 1, 1],
			],
			faceNormal: [0, 0, 1],
		},
		xNegative: {
			geometry: [
				[0, 0, 0],
				[0, 0, 1],
				[0, 1, 1],
				[0, 1, 0],
				[0, 0, 0],
				[0, 1, 1],
			],
			faceNormal: [-1, 0, 0],
		},
		xPositive: {
			geometry: [
				[1, 0, 1],
				[1, 0, 0],
				[1, 1, 0],
				[1, 1, 1],
				[1, 0, 1],
				[1, 1, 0],
			],
			faceNormal: [1, 0, 0],
		},
	} as const
}

// #region Types
type AllInstanceTypes = Block | PlayerSpawnPoint | Sphere | TutorialHologram | Barrier
type AllPlainOldInstanceTypes = PlainOldBlock | PlainOldBarrier | PlainOldPlayerSpawnPoint | PlainOldTutorialHologram | PlainOldSphere

interface PlainOldBaseCelariaMap {
	mapType: string
	instances: AllPlainOldInstanceTypes[]
	sunRotationHorizontal: number
	sunRotationVertical: number
	previewCamera: {
		from: Vector3
		to: Vector3
	}
	name: string
}
/** I'm a plain old JavaScript object for an editable Celaria map. */
interface PlainOldEditableCelariaMap extends PlainOldBaseCelariaMap {
	mapType: "Editable Celaria map"
}

interface PlainOldInstance {
	position: Vector3
	instanceType: string
}

interface PlainOldBlock extends PlainOldInstance {
	type: number
	rotation: number
	scale: Vector3
	instanceType: "Block"
}

interface PlainOldSphere extends PlainOldInstance {
	instanceType: "Sphere"
}

interface PlainOldPlayerSpawnPoint extends PlainOldInstance {
	rotation: number
	instanceType: "Spawn point"
}

interface PlainOldBarrier extends PlainOldInstance {
	rotation: number
	scale: FlatVector3
	instanceType: "Barrier"
}

interface PlainOldTutorialHologram extends PlainOldInstance {
	type: number
	scale: Vector3
	rotation: number
	instanceType: "Dummy"
}

export default celariaMapHandler
