import Formats from "src/Formats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { InitializationError } from "src/errors.ts";

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { PLYExporter } from "three/addons/exporters/PLYExporter.js";
import { DOMParser as WorkerDOMParser } from "linkedom/worker";
import { changeExt } from "src/common/index.ts";

function loadTextureBitmap(
  this: THREE.TextureLoader,
  url: string,
  onLoad?: (texture: THREE.Texture) => void,
  _onProgress?: unknown,
  onError?: (error: unknown) => void,
) {
  const texture = new THREE.Texture();
  texture.flipY = false;
  const resolved = this.manager.resolveURL((this.path ?? "") + url);
  this.manager.itemStart(resolved);
  fetch(resolved)
    .then((response) => response.blob())
    .then((blob) => createImageBitmap(blob, { imageOrientation: "flipY" }))
    .then(
      (bitmap) => {
        texture.image = bitmap;
        texture.needsUpdate = true;
        onLoad?.(texture);
        this.manager.itemEnd(resolved);
      },
      (error) => {
        onError?.(error);
        this.manager.itemError(resolved);
        this.manager.itemEnd(resolved);
      },
    );
  return texture;
}

class WorkerXMLParser {
  parseFromString(text: string, type: string) {
    // "<m:tex2coord" -> "<tex2coord", linkedom has no namespaces
    return new WorkerDOMParser().parseFromString(
      text.replace(/<(\/?)[\w.-]+:/g, "<$1"),
      type as "text/xml",
    );
  }
}

function withWorkerDom<T>(parse: () => T): T {
  if (typeof document !== "undefined") return parse();

  const load = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = loadTextureBitmap as typeof load;
  Object.assign(globalThis, { DOMParser: WorkerXMLParser });
  try {
    return parse();
  } finally {
    THREE.TextureLoader.prototype.load = load;
    Reflect.deleteProperty(globalThis, "DOMParser");
  }
}

class threejsHandler implements FormatHandler {
  public readonly name = "threejs";
  public supportedFormats = [
    Formats.GLB.builder("glb").fromTo(),
    Formats.GLTF.builder("gltf").from(), // doesnt export in a worker
    Formats.OBJ.builder("obj").fromTo(),
    Formats.STL.builder("stl").fromTo(),
    Formats.PLY.builder("ply").fromTo(),
    Formats.FBX.builder("fbx").from(),
    Formats.DAE.builder("dae").from(),
    Formats.THREEMF.builder("3mf").from(),
    Formats.PNG.builder("png").to(),
    Formats.JPEG.builder("jpeg").to(),
    Formats.WEBP.builder("webp").to(),
  ];
  public ready = false;

  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 4096);
  private canvas?: OffscreenCanvas;
  private renderer?: THREE.WebGLRenderer;

  async init() {
    this.canvas = new OffscreenCanvas(960, 540);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas });
    this.renderer.setSize(960, 540, false);

    this.scene.background = new THREE.Color(0x424242);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(1, 1, 1);
    this.camera.add(light);
    this.scene.add(this.camera);

    this.ready = true;
  }

  async loadModel(bytes: Uint8Array, format: string) {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) =>
      url.startsWith("data:") || url.startsWith("blob:") ? url : "data:,",
    );

    const model = await this.parseModel(bytes, format, manager);

    const idle = new Promise<void>((resolve) => (manager.onLoad = () => resolve()));
    manager.itemStart("idle");
    manager.itemEnd("idle");
    await idle;

    // remove bad textures
    model.object.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Points)) return;
      for (const material of [child.material].flat() as Record<string, unknown>[]) {
        for (const [key, value] of Object.entries(material)) {
          if (value instanceof THREE.Texture && !value.image?.width) material[key] = null;
        }
      }
    });

    return model;
  }

  async parseModel(
    bytes: Uint8Array,
    format: string,
    manager: THREE.LoadingManager,
  ): Promise<{ object: THREE.Object3D; animations: THREE.AnimationClip[] }> {
    const buffer = bytes.slice().buffer;
    const meshMaterial = new THREE.MeshStandardMaterial({
      color: 0xb0b0b0,
      side: THREE.DoubleSide,
    });

    switch (format) {
      case "glb":
      case "gltf": {
        const gltf = await new GLTFLoader(manager).parseAsync(buffer, "");
        return { object: gltf.scene, animations: gltf.animations };
      }
      case "obj":
        return {
          object: new OBJLoader(manager).parse(new TextDecoder().decode(bytes)),
          animations: [],
        };
      case "stl": {
        const geometry = new STLLoader(manager).parse(buffer);
        if (geometry.hasAttribute("color")) meshMaterial.vertexColors = true;
        // stl is z-up, three is y-up
        const group = new THREE.Group();
        group.rotation.x = -Math.PI / 2;
        group.add(new THREE.Mesh(geometry, meshMaterial));
        return { object: group, animations: [] };
      }
      case "ply": {
        const geometry = new PLYLoader(manager).parse(buffer);
        const hasColors = geometry.hasAttribute("color");
        if (!geometry.index) {
          return {
            object: new THREE.Points(
              geometry,
              new THREE.PointsMaterial({
                size: 2,
                sizeAttenuation: false,
                vertexColors: hasColors,
              }),
            ),
            animations: [],
          };
        }
        if (!geometry.hasAttribute("normal")) geometry.computeVertexNormals();
        meshMaterial.vertexColors = hasColors;
        return { object: new THREE.Mesh(geometry, meshMaterial), animations: [] };
      }
      case "fbx": {
        const group = withWorkerDom(() => new FBXLoader(manager).parse(buffer, ""));
        return { object: group, animations: group.animations };
      }
      case "dae": {
        const collada = withWorkerDom(() =>
          new ColladaLoader(manager).parse(new TextDecoder().decode(bytes), ""),
        );
        if (!collada) throw new Error("Failed to parse COLLADA file.");
        return { object: collada.scene, animations: collada.scene.animations };
      }
      case "3mf": {
        // 3mf is z-up, three is y-up
        const group = withWorkerDom(() => new ThreeMFLoader(manager).parse(buffer));
        group.rotation.x = -Math.PI / 2;
        return { object: group, animations: [] };
      }
      default:
        throw new TypeError(`Unsupported input format: ${format}`);
    }
  }

  async exportModel(
    object: THREE.Object3D,
    animations: THREE.AnimationClip[],
    format: string,
  ): Promise<Uint8Array> {
    object.updateMatrixWorld(true);

    switch (format) {
      case "glb": {
        const result = await new GLTFExporter().parseAsync(object, { binary: true, animations });
        return new Uint8Array(result as ArrayBuffer);
      }
      case "obj":
        return new TextEncoder().encode(new OBJExporter().parse(object));
      case "stl": {
        // back to z-up
        const group = new THREE.Group();
        group.rotation.x = Math.PI / 2;
        group.add(object);
        group.updateMatrixWorld(true);
        const result = new STLExporter().parse(group, { binary: true });
        group.remove(object);
        return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
      }
      case "ply": {
        const result = await new Promise<ArrayBuffer>((resolve) => {
          new PLYExporter().parse(object, (data) => resolve(data as ArrayBuffer), { binary: true });
        });
        return new Uint8Array(result);
      }
      default:
        throw new TypeError(`Unsupported output format: ${format}`);
    }
  }

  async render(object: THREE.Object3D, mime: string): Promise<Uint8Array> {
    if (!this.canvas || !this.renderer) throw new InitializationError("Handler not initialized.");

    this.scene.add(object);
    object.updateMatrixWorld(true);

    const sphere = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
    const radius = sphere.radius || 1;
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.position
      .copy(sphere.center)
      .add(new THREE.Vector3(1, 0.8, 1.5).normalize().multiplyScalar(distance));
    this.camera.near = distance / 100;
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(sphere.center);

    this.renderer.render(this.scene, this.camera);
    this.scene.remove(object);

    const rendered = await this.canvas.convertToBlob({ type: mime });
    return rendered.bytes();
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (!this.ready) throw new InitializationError("Handler not initialized.");

    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const { object, animations } = await this.loadModel(inputFile.bytes, inputFormat.internal);

      const bytes = ["png", "jpeg", "webp"].includes(outputFormat.internal)
        ? await this.render(object, outputFormat.mime)
        : await this.exportModel(object, animations, outputFormat.internal);

      const name = changeExt(inputFile.name, outputFormat.extension);
      outputFiles.push({ bytes, name });
    }

    return outputFiles;
  }
}

export default threejsHandler;
