import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import * as THREE from "three";

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { TDSLoader } from "three/addons/loaders/TDSLoader.js";

import type { GLTF } from "three/addons/loaders/GLTFLoader.js";

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
      lossless: false
    },
    {
      name: "Wavefront OBJ",
      format: "obj",
      extension: "obj",
      mime: "text/plain",
      from: true,
      to: false,
      internal: "obj",
      category: "model",
      lossless: false
    },
    {
      name: "Autodesk FBX",
      format: "fbx",
      extension: "fbx",
      mime: "application/octet-stream",
      from: true,
      to: false,
      internal: "fbx",
      category: "model",
      lossless: false
    },
    {
      name: "Autodesk FBX",
      format: "fbx",
      extension: "fbx",
      mime: "model/vnd.fbx",
      from: true,
      to: false,
      internal: "fbx",
      category: "model",
      lossless: false
    },
    {
      name: "STL",
      format: "stl",
      extension: "stl",
      mime: "model/stl",
      from: true,
      to: false,
      internal: "stl",
      category: "model",
      lossless: true
    },
    {
      name: "STL",
      format: "stl",
      extension: "stl",
      mime: "model/x.stl-binary",
      from: true,
      to: false,
      internal: "stl",
      category: "model",
      lossless: true
    },
    {
      name: "PLY",
      format: "ply",
      extension: "ply",
      mime: "application/octet-stream",
      from: true,
      to: false,
      internal: "ply",
      category: "model",
      lossless: true
    },
    {
      name: "PLY",
      format: "ply",
      extension: "ply",
      mime: "application/ply",
      from: true,
      to: false,
      internal: "ply",
      category: "model",
      lossless: true
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
    {
      name: "3DS",
      format: "3ds",
      extension: "3ds",
      mime: "application/octet-stream",
      from: true,
      to: false,
      internal: "3ds",
      category: "model",
      lossless: false
    },
    CommonFormats.PNG.supported("png", false, true),
    CommonFormats.JPEG.supported("jpeg", false, true),
    CommonFormats.WEBP.supported("webp", false, true)
  ];

  public ready: boolean = false;

  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(90, 16 / 9, 0.1, 4096);
  private renderer = new THREE.WebGLRenderer({ antialias: true });

  async init () {
    this.renderer.setSize(960, 540);

    // lighting (critical)
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const directional = new THREE.DirectionalLight(0xffffff, 1);
    directional.position.set(5, 5, 5);

    this.scene.add(ambient);
    this.scene.add(directional);

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

      let object: THREE.Object3D;

      switch (inputFormat.internal) {

        case "glb": {
          const gltf: GLTF = await new Promise((resolve, reject) => {
            new GLTFLoader().load(url, resolve, undefined, reject);
          });
          object = gltf.scene;
          break;
        }

        case "obj":
          object = await new Promise((resolve, reject) => {
            new OBJLoader().load(url, resolve, undefined, reject);
          });
          break;

        case "fbx":
          object = await new Promise((resolve, reject) => {
            new FBXLoader().load(url, resolve, undefined, reject);
          });
          break;

        case "stl": {
          const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
            new STLLoader().load(url, resolve, undefined, reject);
          });

          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ color: 0xcccccc })
          );

          object = new THREE.Group();
          object.add(mesh);
          break;
        }

        case "ply": {
          const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
            new PLYLoader().load(url, resolve, undefined, reject);
          });

          geometry.computeVertexNormals();

          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ color: 0xcccccc })
          );

          object = new THREE.Group();
          object.add(mesh);
          break;
        }

        case "dae": {
          const collada = await new Promise<any>((resolve, reject) => {
            new ColladaLoader().load(url, resolve, undefined, reject);
          });
          object = collada.scene;
          break;
        }

        case "3ds":
          object = await new Promise((resolve, reject) => {
            new TDSLoader().load(url, resolve, undefined, reject);
          });
          break;

        default:
          throw new Error("Invalid input format");
      }

      // center + scale
      const bbox = new THREE.Box3().setFromObject(object);
      const center = bbox.getCenter(new THREE.Vector3());
      const size = bbox.getSize(new THREE.Vector3());

      object.position.sub(center);

      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2 / maxDim;
      object.scale.setScalar(scale);

      this.camera.position.set(0, 0, 3);
      this.camera.lookAt(0, 0, 0);

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

      const name =
        inputFile.name.split(".").slice(0, -1).join(".") +
        "." +
        outputFormat.extension;

      outputFiles.push({ bytes, name });

      URL.revokeObjectURL(url);
    }

    return outputFiles;
  }
}

export default threejsHandler;
