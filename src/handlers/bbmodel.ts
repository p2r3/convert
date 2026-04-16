import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import * as THREE from "three";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";

type OutlinerEntry = string | BBModelGroup;
type BBModelCubeFace = "north" | "south" | "east" | "west" | "up" | "down";

interface BBModel {
  elements?: BBModelElement[];
  groups?: BBModelGroup[];
  outliner?: OutlinerEntry[];
}

interface BBModelNodeBase {
  uuid?: string;
  name?: string;
  origin?: number[];
  rotation?: number[];
  visibility?: boolean;
  export?: boolean;
}

interface BBModelGroup extends BBModelNodeBase {
  children?: OutlinerEntry[];
}

interface BBModelFace {
  enabled?: boolean;
}

interface BBModelCube extends BBModelNodeBase {
  from: number[];
  to: number[];
  inflate?: number;
  faces?: Partial<Record<BBModelCubeFace, BBModelFace | null>>;
}

interface BBModelMeshFace {
  vertices?: string[] | Record<string, unknown>;
}

interface BBModelMesh extends BBModelNodeBase {
  vertices: Record<string, number[]>;
  faces?: Record<string, BBModelMeshFace | null>;
}

type BBModelElement = BBModelCube | BBModelMesh;

const cubeFaces: BBModelCubeFace[] = ["east", "west", "up", "down", "south", "north"];

function isNodeVisible(node: BBModelNodeBase) {
  return node.export !== false && node.visibility !== false;
}

function isCubeElement(element: BBModelElement): element is BBModelCube {
  return Array.isArray((element as BBModelCube).from) && Array.isArray((element as BBModelCube).to);
}

function isMeshElement(element: BBModelElement): element is BBModelMesh {
  return typeof (element as BBModelMesh).vertices === "object" && (element as BBModelMesh).vertices !== null;
}

function toVector3(input?: number[]) {
  return new THREE.Vector3(input?.[0] ?? 0, input?.[1] ?? 0, input?.[2] ?? 0);
}

function toEuler(input?: number[]) {
  return new THREE.Euler(
    THREE.MathUtils.degToRad(input?.[0] ?? 0),
    THREE.MathUtils.degToRad(input?.[1] ?? 0),
    THREE.MathUtils.degToRad(input?.[2] ?? 0),
    "XYZ"
  );
}

function createPivotMatrix(origin?: number[], rotation?: number[]) {
  const pivot = toVector3(origin);
  const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(toEuler(rotation));

  return new THREE.Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(rotationMatrix)
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}

function createGroupObject(group: BBModelGroup) {
  const object = new THREE.Group();
  object.name = group.name ?? group.uuid ?? "group";
  object.matrixAutoUpdate = false;
  object.matrix.copy(createPivotMatrix(group.origin, group.rotation));
  return object;
}

function createCubeGeometry(element: BBModelCube) {
  const inflate = element.inflate ?? 0;
  const minX = Math.min(element.from[0], element.to[0]) - inflate;
  const minY = Math.min(element.from[1], element.to[1]) - inflate;
  const minZ = Math.min(element.from[2], element.to[2]) - inflate;
  const maxX = Math.max(element.from[0], element.to[0]) + inflate;
  const maxY = Math.max(element.from[1], element.to[1]) + inflate;
  const maxZ = Math.max(element.from[2], element.to[2]) + inflate;

  const geometry = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
  const index = geometry.getIndex();
  if (!index) {
    throw new Error("Failed to build cube geometry.");
  }

  const visibleIndices: number[] = [];
  for (const faceName of cubeFaces) {
    const face = element.faces?.[faceName];
    if (face === null || face?.enabled === false) continue;
    const group = geometry.groups[cubeFaces.indexOf(faceName)];
    for (let i = group.start; i < group.start + group.count; i++) {
      visibleIndices.push(index.array[i]);
    }
  }

  geometry.setIndex(visibleIndices);
  geometry.translate(
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2
  );
  geometry.applyMatrix4(createPivotMatrix(element.origin, element.rotation));

  return geometry;
}

function getMeshFaceVertexIds(face: BBModelMeshFace) {
  if (Array.isArray(face.vertices)) {
    return face.vertices;
  }
  if (face.vertices && typeof face.vertices === "object") {
    return Object.keys(face.vertices);
  }
  return [];
}

function createMeshGeometry(element: BBModelMesh) {
  const positions: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const face of Object.values(element.faces ?? {})) {
    if (!face) continue;

    const vertexIds = getMeshFaceVertexIds(face);
    if (vertexIds.length < 3) continue;

    const faceVertexIndices: number[] = [];
    for (const vertexId of vertexIds) {
      const vertex = element.vertices[vertexId];
      if (!Array.isArray(vertex) || vertex.length < 3) {
        throw new Error(`Mesh vertex "${vertexId}" is invalid.`);
      }
      positions.push(vertex[0], vertex[1], vertex[2]);
      faceVertexIndices.push(vertexOffset++);
    }

    for (let i = 1; i < faceVertexIndices.length - 1; i++) {
      indices.push(faceVertexIndices[0], faceVertexIndices[i], faceVertexIndices[i + 1]);
    }
  }

  if (positions.length === 0 || indices.length === 0) {
    throw new Error("No supported mesh faces found.");
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.applyMatrix4(createPivotMatrix(element.origin, element.rotation));
  geometry.computeVertexNormals();
  return geometry;
}

function createElementObject(element: BBModelElement) {
  if (!isNodeVisible(element)) return null;

  let geometry: THREE.BufferGeometry;
  if (isCubeElement(element)) {
    geometry = createCubeGeometry(element);
  } else if (isMeshElement(element)) {
    geometry = createMeshGeometry(element);
  } else {
    return null;
  }

  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = element.name ?? element.uuid ?? "element";
  return mesh;
}

export function bbmodelToObject(model: BBModel) {
  const root = new THREE.Group();
  const groupsByUuid = new Map((model.groups ?? []).flatMap(group => group.uuid ? [[group.uuid, group] as const] : []));
  const elementsByUuid = new Map((model.elements ?? []).flatMap(element => element.uuid ? [[element.uuid, element] as const] : []));
  const attachedGroups = new Set<string>();
  const attachedElements = new Set<string>();

  const attachEntry = (entry: OutlinerEntry, parent: THREE.Object3D) => {
    if (typeof entry === "string") {
      const group = groupsByUuid.get(entry);
      if (group) {
        attachGroup(group, parent);
        return;
      }

      const element = elementsByUuid.get(entry);
      if (element) {
        attachElement(element, parent);
      }
      return;
    }

    if (Array.isArray(entry.children)) {
      const group = entry.uuid ? groupsByUuid.get(entry.uuid) : undefined;
      attachGroup({
        ...group,
        ...entry,
        children: entry.children
      }, parent);
      return;
    }

    if (entry.uuid) {
      const element = elementsByUuid.get(entry.uuid);
      if (element) attachElement(element, parent);
    }
  };

  const attachGroup = (group: BBModelGroup, parent: THREE.Object3D) => {
    if (group.uuid) attachedGroups.add(group.uuid);
    if (!isNodeVisible(group)) return;

    const groupObject = createGroupObject(group);
    parent.add(groupObject);

    for (const child of group.children ?? []) {
      attachEntry(child, groupObject);
    }
  };

  const attachElement = (element: BBModelElement, parent: THREE.Object3D) => {
    if (element.uuid) attachedElements.add(element.uuid);
    const object = createElementObject(element);
    if (object) {
      parent.add(object);
    }
  };

  if (Array.isArray(model.outliner)) {
    for (const entry of model.outliner) {
      attachEntry(entry, root);
    }
  }

  for (const group of model.groups ?? []) {
    if (group.uuid && attachedGroups.has(group.uuid)) continue;
    attachGroup(group, root);
  }

  for (const element of model.elements ?? []) {
    if (element.uuid && attachedElements.has(element.uuid)) continue;
    attachElement(element, root);
  }

  if (root.children.length === 0) {
    throw new Error("No supported geometry found in .bbmodel file.");
  }

  root.updateMatrixWorld(true);
  return root;
}

export function bbmodelToObj(input: string | BBModel) {
  const model = typeof input === "string" ? JSON.parse(input) as BBModel : input;
  const exporter = new OBJExporter();
  return exporter.parse(bbmodelToObject(model));
}

class bbmodelHandler implements FormatHandler {
  public name: string = "bbmodel";
  public ready: boolean = false;
  public supportedFormats: FileFormat[] = [
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
    CommonFormats.JSON.builder("bbmodel")
      .named("Blockbench Project")
      .withFormat("bbmodel")
      .withExt("bbmodel")
      .withCategory("model")
      .allowFrom(true)
      .allowTo(false)
  ];

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    if (inputFormat.internal !== "bbmodel" || outputFormat.internal !== "obj") {
      throw new Error("Invalid input/output format.");
    }

    return inputFiles.map(file => {
      const baseName = file.name.replace(/\.[^.]+$/u, "");
      const text = new TextDecoder().decode(file.bytes);
      const bytes = new TextEncoder().encode(bbmodelToObj(text));
      return {
        name: `${baseName}.${outputFormat.extension}`,
        bytes,
      };
    });
  }
}

export default bbmodelHandler;
