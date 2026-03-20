import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { TDSLoader } from "three/addons/loaders/TDSLoader.js";
import { VRMLLoader } from "three/addons/loaders/VRMLLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { Collada } from "three/addons/loaders/ColladaLoader.js";

class threejsHandler implements FormatHandler {

  public name: string = "threejs";
  public supportedFormats = [
    {
      name: "GL Transmission Format Binary",
      format: "glb",
      extension: "glb",
      mime: "model/gltf-binary",
      from: true,
      to: false,
      internal: "glb",
      category: "model",
      lossless: false
    },
    {
      name: "GL Transmission Format",
      format: "gltf",
      extension: "gltf",
      mime: "model/gltf+json",
      from: true,
      to: false,
      internal: "glb",
      category: "model",
      lossless: false
    },
    {
      name: "Wavefront OBJ",
      format: "obj",
      extension: "obj",
      mime: "model/obj",
      from: true,
      to: false,
      internal: "obj",
      category: "model",
      lossless: false,
    },
    {
      name: "Stereolithography",
      format: "stl",
      extension: "stl",
      mime: "model/stl",
      from: true,
      to: false,
      internal: "stl",
      category: "model",
      lossless: false
    },
    {
      name: "Polygon File Format",
      format: "ply",
      extension: "ply",
      mime: "model/ply",
      from: true,
      to: false,
      internal: "ply",
      category: "model",
      lossless: false
    },
    {
      name: "Filmbox",
      format: "fbx",
      extension: "fbx",
      mime: "model/fbx",
      from: true,
      to: false,
      internal: "fbx",
      category: "model",
      lossless: false
    },
    {
      name: "Collada",
      format: "dae",
      extension: "dae",
      mime: "model/vnd.collada+xml",
      from: true,
      to: false,
      internal: "dae",
      category: "model",
      lossless: false
    },
    // NEW FORMATS BELOW
    {
      name: "3D Studio",
      format: "3ds",
      extension: "3ds",
      mime: "model/3ds",
      from: true,
      to: false,
      internal: "3ds",
      category: "model",
      lossless: false
    },
    {
      name: "VRML",
      format: "wrl",
      extension: "wrl",
      mime: "model/vrml",
      from: true,
      to: false,
      internal: "wrl",
      category: "model",
      lossless: false
    },
    {
      name: "three.js JSON Object",
      format: "json",
      extension: "json",
      mime: "application/json",
      from: true,
      to: false,
      internal: "json",
      category: "model",
      lossless: false
    },
    // Image formats
    CommonFormats.PNG.supported("png", false, true),
    CommonFormats.JPEG.supported("jpeg", false, true),
    CommonFormats.WEBP.supported("webp", false, true)
  ];
  public ready: boolean = false;

  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(90, 16 / 9, 0.1, 4096);
  private renderer = new THREE.WebGLRenderer();

  async init () {
    this.renderer.setSize(960, 540);
    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {

      const blob = new Blob([inputFile.bytes as BlobPart]);
      const url = URL.createObjectURL(blob);

      let object: THREE.Group<THREE.Object3DEventMap> | THREE.Object3D;

      switch (inputFormat.internal) {
        case "glb": {
          const gltf: GLTF = await new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load(url, resolve, undefined, reject);
          });
          object = gltf.scene;
          break;
        }
        case "obj":
          object = await new Promise((resolve, reject) => {
            const loader = new OBJLoader();
            loader.load(url, resolve, undefined, reject);
          });
          break;
        case "stl": {
          const geometry: THREE.BufferGeometry = await new Promise((resolve, reject) => {
            const loader = new STLLoader();
            loader.load(url, resolve, undefined, reject);
          });
          const material = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
          object = new THREE.Mesh(geometry, material);
          break;
        }
        case "ply": {
          const geometry: THREE.BufferGeometry = await new Promise((resolve, reject) => {
            const loader = new PLYLoader();
            loader.load(url, resolve, undefined, reject);
          });
          const material = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
          object = new THREE.Mesh(geometry, material);
          break;
        }
        case "fbx":
          object = await new Promise((resolve, reject) => {
            const loader = new FBXLoader();
            loader.load(url, resolve, undefined, reject);
          });
          break;
        case "dae": {
          const result: Collada = await new Promise((resolve, reject) => {
            const loader = new ColladaLoader();
            loader.load(url, resolve, undefined, reject);
          });
          object = result.scene;
          break;
        }
        case "3ds":
          object = await new Promise((resolve, reject) => {
            const loader = new TDSLoader();
            loader.load(url, resolve, undefined, reject);
          });
          break;
        case "wrl":
          object = await new Promise((resolve, reject) => {
            const loader = new VRMLLoader();
            loader.load(url, resolve, undefined, reject);
          });
          break;
        case "json":
          // Use ObjectLoader directly, as it needs the JSON object
          const jsonString = new TextDecoder().decode(inputFile.bytes);
          object = new THREE.ObjectLoader().parse(JSON.parse(jsonString));
          break;
        default:
          throw new Error("Invalid input format");
      }

      // Camera placement & rendering
      const bbox = new THREE.Box3().setFromObject(object);
      bbox.getCenter(this.camera.position);
      this.camera.position.z = bbox.max.z * 2;

      this.scene.background = new THREE.Color(0x424242);
      this.scene.add(object);
      this.renderer.render(this.scene, this.camera);
      this.scene.remove(object);

      const bytes: Uint8Array = await new Promise((resolve, reject) => {
        this.renderer.domElement.toBlob((blob) => {
          if (!blob) return reject("Canvas output failed");
          blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
        }, outputFormat.mime);
      });
      const name = inputFile.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension;
      outputFiles.push({ bytes, name });

      URL.revokeObjectURL(url);
    }

    return outputFiles;
  }

}

export default threejsHandler;
