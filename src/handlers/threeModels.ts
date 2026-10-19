import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { changeExt, encode } from "src/common/index.ts";
import * as THREE from "three";

/** A material that shows the colours a scan or a print file stores per vertex. */
const mesh = (geometry: THREE.BufferGeometry) =>
  new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: geometry.hasAttribute("color") }),
  );
const text = (bytes: ArrayBuffer) => new TextDecoder().decode(bytes);

// each loader and exporter is fetched when its format is first used, not with the handler
type Load = (bytes: ArrayBuffer, manager: THREE.LoadingManager) => Promise<THREE.Object3D>;

const LOADERS: Record<string, Load> = {
  async glb(bytes, manager) {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    return (await new GLTFLoader(manager).parseAsync(bytes, "")).scene;
  },
  async obj(bytes, manager) {
    const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
    return new OBJLoader(manager).parse(text(bytes));
  },
  async stl(bytes, manager) {
    const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
    return mesh(new STLLoader(manager).parse(bytes));
  },
  async ply(bytes, manager) {
    const { PLYLoader } = await import("three/addons/loaders/PLYLoader.js");
    return mesh(new PLYLoader(manager).parse(bytes));
  },
  async "3mf"(bytes, manager) {
    const { ThreeMFLoader } = await import("three/addons/loaders/3MFLoader.js");
    return new ThreeMFLoader(manager).parse(bytes);
  },
  async fbx(bytes, manager) {
    const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
    return new FBXLoader(manager).parse(bytes, "");
  },
  async dae(bytes, manager) {
    const { ColladaLoader } = await import("three/addons/loaders/ColladaLoader.js");
    const collada = new ColladaLoader(manager).parse(text(bytes), "");
    if (!collada) throw new Error("The Collada file has no scene.");
    return collada.scene;
  },
  async "3ds"(bytes, manager) {
    const { TDSLoader } = await import("three/addons/loaders/TDSLoader.js");
    return new TDSLoader(manager).parse(bytes, "");
  },
  async usdz(bytes, manager) {
    const { USDLoader } = await import("three/addons/loaders/USDLoader.js");
    return new Promise((resolve, reject) =>
      new USDLoader(manager).parse(bytes, "", resolve, reject),
    );
  },
};

const EXPORTERS: Record<string, (object: THREE.Object3D) => Promise<BlobPart>> = {
  async glb(object) {
    const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
    return (await new GLTFExporter().parseAsync(object, { binary: true })) as ArrayBuffer;
  },
  async gltf(object) {
    const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
    return JSON.stringify(await new GLTFExporter().parseAsync(object, { binary: false }));
  },
  async obj(object) {
    const { OBJExporter } = await import("three/addons/exporters/OBJExporter.js");
    return new OBJExporter().parse(object);
  },
  async stl(object) {
    const { STLExporter } = await import("three/addons/exporters/STLExporter.js");
    return new STLExporter().parse(object, { binary: true }) as DataView<ArrayBuffer>;
  },
  async ply(object) {
    const { PLYExporter } = await import("three/addons/exporters/PLYExporter.js");
    const ply = new PLYExporter().parse(object, () => {}, { binary: true });
    if (!ply) throw new Error("The model has no mesh to write as PLY.");
    return ply;
  },
  async usdz(object) {
    const { USDZExporter } = await import("three/addons/exporters/USDZExporter.js");
    return (await new USDZExporter().parseAsync(object)) as Uint8Array<ArrayBuffer>;
  },
};

/**
 * Removes the textures that never got an image. A model that names texture files next to it
 * arrives here without them, and an exporter that meets such a texture gives up on the model.
 */
function dropMissingTextures(object: THREE.Object3D) {
  object.traverse((child) => {
    const materials = (child as THREE.Mesh).material ?? [];
    for (const material of Array.isArray(materials) ? materials : [materials]) {
      const slots = material as unknown as Record<string, unknown>;
      for (const [slot, value] of Object.entries(slots)) {
        if (value instanceof THREE.Texture && !value.image) slots[slot] = null;
      }
    }
  });
}

/** Converts between 3D model formats with the loaders and exporters of three.js. */
class threeModelsHandler implements FormatHandler {
  public readonly name = "threeModels";
  public supportedFormats = [
    Formats.GLB.builder("glb").fromTo(),
    Formats.GLTF.builder("gltf").to(),
    // a .gltf with its buffers in other files cannot be read from one file; one with them inline can
    Formats.GLTF.builder("glb").from(),
    Formats.OBJ.builder("obj").fromTo(),
    Formats.STL.builder("stl").fromTo(),
    Formats.PLY.builder("ply").fromTo(),
    Formats.USDZ.builder("usdz").fromTo(),
    Formats.THREE_MF.builder("3mf").from(),
    Formats.FBX.builder("fbx").from(),
    Formats.DAE.builder("dae").from(),
    Formats.TDS.builder("3ds").from(),
  ];
  public ready = false;
  public offload = false; // the Collada and 3MF loaders read XML with the DOM, and textures need images

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    for (const file of inputFiles) {
      const manager = new THREE.LoadingManager();
      let loading = false;
      manager.onStart = () => (loading = true);
      const texturesSettled = new Promise<void>((resolve) => (manager.onLoad = resolve));

      // a copy, because some loaders keep views of the buffer they are given
      const input = new Uint8Array(file.bytes).buffer;
      const object = await LOADERS[inputFormat.internal](input, manager);
      // textures inside the file load after the loader has returned
      if (loading) await texturesSettled;
      dropMissingTextures(object);
      object.updateMatrixWorld(true);
      const output = await EXPORTERS[outputFormat.internal](object);
      const bytes =
        typeof output === "string"
          ? encode(output)
          : new Uint8Array(await new Blob([output]).arrayBuffer());
      outputFiles.push({ name: changeExt(file.name, outputFormat.extension), bytes });
    }
    return outputFiles;
  }
}

export default threeModelsHandler;
