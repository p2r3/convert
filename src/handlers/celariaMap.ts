import { CelariaMap } from "celaria-formats/class/maps/CelariaMap.mjs";
import { EditableCelariaMap } from "celaria-formats/class/maps/EditableCelariaMap.mjs";
import { Barrier } from "celaria-formats/class/maps/objects/Barrier.mjs";
import { Block } from "celaria-formats/class/maps/objects/Block.mjs";
import { Instance } from "celaria-formats/class/maps/objects/Instance.mjs";
import { PlayerSpawnPoint } from "celaria-formats/class/maps/objects/PlayerSpawnPoint.mjs";
import { Sphere } from "celaria-formats/class/maps/objects/Sphere.mjs";
import { TutorialHologram } from "celaria-formats/class/maps/objects/TutorialHologram.mjs";
import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { Buffer } from "buffer";
import { changeExt, encode } from "src/common/index.ts";

(globalThis as any).Buffer = Buffer;

class celariaMapHandler implements FormatHandler {
  public readonly name = "celariaMap";
  public supportedFormats = [
    Formats.OBJ.builder("obj").to(),
    Formats.ECMAP.builder("ecmap").fromTo(),
    Formats.CMAP.builder("cmap").from(),
  ];
  public ready = false;
  /**/
  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    return inputFiles.map((file) => {
      if (inputFormat.internal === "ecmap") {
        const editableCelariaMap = EditableCelariaMap.parse(Buffer.from(file.bytes));
        if (outputFormat.internal === "obj") {
          const modelBuilder = new ModelBuilder(editableCelariaMap.instances);
          modelBuilder.do();
          return {
            name: changeExt(file.name, outputFormat.extension),
            bytes: encode(modelBuilder.toString()),
          };
        }
      }
      if (inputFormat.internal === "cmap" && outputFormat.internal === "ecmap") {
        const celariaMap = CelariaMap.parse(Buffer.from(file.bytes));
        const editableCelariaMap = new EditableCelariaMap();
        editableCelariaMap.checkpointOrder = celariaMap.checkpointOrder;
        editableCelariaMap.instances = celariaMap.instances;
        editableCelariaMap.name = celariaMap.name;
        editableCelariaMap.previewCamera = celariaMap.previewCamera;
        editableCelariaMap.sunRotationHorizontal = celariaMap.sunRotationHorizontal;
        editableCelariaMap.sunRotationVertical = celariaMap.sunRotationVertical;
        const suitableVersion = celariaMapHandler.determineSuitableVersion(
          "ecmap",
          editableCelariaMap.instances,
        );
        return {
          name: changeExt(file.name, outputFormat.extension),
          bytes: Uint8Array.from(editableCelariaMap.serialize(suitableVersion)),
        };
      }
      throw new TypeError(
        `Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`,
      );
    });
  }
  /** Determine a version most suitable for compatibility based on the given {@link instances}. Prefers versions for the latest available free open alpha version. Otherwise uses latest commercial Steam release when encountering new objects like {@link Barrier}s. */
  static determineSuitableVersion(format: "ecmap" | "cmap", instances: Instance[]): number {
    const containsBarriers = instances.some(
      (instance) => instance.instanceId == 3 || instance.instanceId == 4,
    );
    if (format === "ecmap") {
      if (containsBarriers) {
        return 4;
      } else {
        return 2;
      }
    }
    throw new TypeError("Unsupported format.");
  }
}
/** I help build a Wavefront OBJ of a map. */
class ModelBuilder {
  objString: string;
  vertexCount: number;
  instances: AllInstanceTypes[];
  /**/
  constructor(instances: AllInstanceTypes[]) {
    this.objString = "";
    this.vertexCount = 1;
    this.instances = instances;
  }

  do() {
    this.instances
      .filter((instance) => instance.instanceId === 0)
      .forEach((block) => {
        this.appendBlock(block);
      });
  }

  appendBlock(instance: Block) {
    Object.values(ModelBuilder.directions).forEach((face) => {
      const radians = ModelBuilder.degreesToRadians(-instance.rotation);
      for (let i = 0; i < face.geometry.length / 3; i++) {
        const vertexOffset = i * 3;
        [
          face.geometry[vertexOffset],
          face.geometry[vertexOffset + 1],
          face.geometry[vertexOffset + 2],
        ].forEach((vertex) => {
          const result = [];
          // scale and offset from base cube geometry.
          const scaledVertex = vertex.map(
            (vertexComponent, componentIndex) =>
              (vertexComponent - 0.5) * instance.scale[componentIndex],
          );
          // perform rotation
          result[0] = scaledVertex[0] * Math.cos(radians) - scaledVertex[1] * Math.sin(radians);
          result[1] = scaledVertex[0] * Math.sin(radians) + scaledVertex[1] * Math.cos(radians);
          result[2] = scaledVertex[2];
          // add vertex
          this.objString += `v ${result.map((vertexComponent, componentIndex) => vertexComponent + instance.position[componentIndex]).join(" ")}\n`;
        });
        // add face definition
        this.objString += `f ${this.vertexCount}/${this.vertexCount} ${this.vertexCount + 1}/${this.vertexCount + 1} ${this.vertexCount + 2}/${this.vertexCount + 2}\n`;
        this.vertexCount += 3;
      }
    });
  }
  /** Solves the most curious mathematical problem. */
  static degreesToRadians(degrees: number) {
    const conversionConstant = 57.2957795;
    return degrees / conversionConstant;
  }

  toString() {
    return this.objString;
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
  } as const;
}

// #region Types
type AllInstanceTypes = Block | PlayerSpawnPoint | Sphere | TutorialHologram | Barrier;
// #endregion

export default celariaMapHandler;
