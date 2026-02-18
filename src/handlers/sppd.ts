import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import * as THREE from "three";
import * as CSG from "three-bvh-csg";

import { Demo } from "./sppd/sppd/Demo.ts";
import { Vector } from "./sppd/sppd/Vector.ts";
import CommonFormats from "src/CommonFormats.ts";

function toThreeVector (vec: Vector) {
  return new THREE.Vector3(vec.y, vec.z, vec.x);
}
function rotateFromSourceAngles (object: THREE.Object3D, angles: Vector) {
  const { forward, up } = angles.Scale(Math.PI / 180).FromAngles();
  object.up.copy(toThreeVector(up));
  object.lookAt(object.position.clone().add(toThreeVector(forward)));
}

function createFloorButton () {
  const group = new THREE.Group();

  const buttonTop = new THREE.Mesh(
    new THREE.CylinderGeometry(36, 36, 4, 16),
    new THREE.MeshLambertMaterial({ color: 0x550000 })
  );
  buttonTop.position.copy(toThreeVector(new Vector(0, 0, 12)));
  const buttonBottom = new THREE.Mesh(
    new THREE.CylinderGeometry(48, 48, 8, 16),
    new THREE.MeshLambertMaterial({ color: 0x202020 })
  );
  buttonBottom.position.copy(toThreeVector(new Vector(0, 0, 4)));

  group.attach(buttonTop);
  group.attach(buttonBottom);

  return group;
}

function createPedestalButton () {
  const group = new THREE.Group();

  const buttonTop = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6, 4, 8),
    new THREE.MeshLambertMaterial({ color: 0x550000 })
  );
  buttonTop.position.copy(toThreeVector(new Vector(0, 0, 26)));
  const buttonBottom = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 52, 8),
    new THREE.MeshLambertMaterial({ color: 0x424242 })
  );

  group.attach(buttonTop);
  group.attach(buttonBottom);

  return group;
}

function createCube () {
  return new CSG.Brush(
    new THREE.BoxGeometry(36, 36, 36),
    new THREE.MeshLambertMaterial({ color: 0x424242 })
  );
}

function createLaserCube () {
  const group = new THREE.Group();

  const cubeBrush = new CSG.Brush(
    new THREE.BoxGeometry(36.5, 36.5, 36.5),
    new THREE.MeshLambertMaterial({ color: 0x101010 })
  );
  const sphereBrush = new CSG.Brush(
    new THREE.SphereGeometry(22.6),
    new THREE.MeshLambertMaterial({ color: 0x101010 })
  );
  const evaluator = new CSG.Evaluator();
  const cubeCase = evaluator.evaluate(cubeBrush, sphereBrush, CSG.SUBTRACTION);

  const cubeLens = new THREE.Mesh(
    new THREE.SphereGeometry(18),
    new THREE.MeshLambertMaterial({ color: 0x00703e })
  );

  group.attach(cubeCase);
  group.attach(cubeLens);

  return group;
}

function createPortal (blue = true) {
  const color = blue ? 0x0e8cff : 0xff8602;

  const portalGeometry = new THREE.CircleGeometry(32, 16);
  portalGeometry.scale(1, 1.625, 1);
  portalGeometry.translate(0, 0, 4);

  const portal = new THREE.Mesh(
    portalGeometry,
    new THREE.MeshBasicMaterial({ color })
  );

  return portal;
}

function createLaserEmitter (centered = false) {
  const group = new THREE.Group();

  const emitterBase = new THREE.Mesh(
    new THREE.BoxGeometry(64, 64, 32),
    new THREE.MeshLambertMaterial({ color: 0x151515 })
  );
  const emitterTip = new THREE.Mesh(
    new THREE.CylinderGeometry(14, 14, 2, 8),
    new THREE.MeshLambertMaterial({ color: 0x242424 })
  );
  if (centered) {
    emitterTip.position.set(0, 0, 16);
  } else {
    emitterTip.position.set(0, -10, 16);
  }
  emitterTip.rotateX(Math.PI / 2);

  group.attach(emitterBase);
  group.attach(emitterTip);

  return group;
}

function getModelBuilder (modelName: string) {
  switch (modelName) {
    case "models/props/portal_button_damaged01.mdl": return createFloorButton;
    case "models/props/portal_button_damaged02.mdl": return createFloorButton;
    case "models/props/portal_button.mdl": return createFloorButton;
    case "models/props/switch001.mdl": return createPedestalButton;
    case "models/props/metal_box.mdl": return createCube;
    case "models/props/reflection_cube.mdl": return createLaserCube;
    case "models/portals/portal1.mdl": return () => createPortal(true);
    case "models/portals/portal2.mdl": return () => createPortal(false);
    case "models/props/laser_emitter.mdl": return createLaserEmitter;
    case "models/props/laser_emitter_center.mdl": return () => createLaserEmitter(true);
  }
}

function getJsonReplacer () {
  const ancestors: object[] = [];
  return function (this: any, _key: string, value: any) {
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }
    while (ancestors.length > 0 && ancestors.at(-1) !== this) {
      ancestors.pop();
    }
    if (ancestors.includes(value)) {
      return `[Circular reference to ${value.constructor.name}]`;
    }
    ancestors.push(value);
    return value;
  };
}

const VOXEL_SIZE = 128;
const VOXEL_SIZE_HALF = VOXEL_SIZE / 2;

const propMaterial = new THREE.MeshLambertMaterial({
  color: 0xff00ff,
  opacity: 0.5,
  transparent: true
});
const brushMaterial = new THREE.MeshLambertMaterial({ color: 0x303030 });
const wallGeometry = new THREE.PlaneGeometry(VOXEL_SIZE, VOXEL_SIZE);
const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x242424 });
const wallPortalMaterial = new THREE.MeshLambertMaterial({ color: 0x505050 });

class sppdHandler implements FormatHandler {

  public name: string = "sppd";
  public supportedFormats: FileFormat[] = [
    {
      name: "Portal 2 Demo File",
      format: "dem",
      extension: "dem",
      mime: "application/x-portal2-demo",
      from: true,
      to: false,
      internal: "dem"
    },
    CommonFormats.PNG.supported("png", false, true),
    CommonFormats.JPEG.supported("jpeg", false, true),
    CommonFormats.JSON.supported("json", false, true, true)
  ];

  public ready: boolean = false;

  private renderBounds = { width: 640, height: 360 };

  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(90, this.renderBounds.width / this.renderBounds.height, 0.1, 4096);
  private renderer = new THREE.WebGLRenderer();

  private ambientLight = new THREE.AmbientLight(0xffffff, 1);
  private pointLight = new THREE.PointLight(0xffffff, 1e5, 4096);

  private wallObjects: THREE.Mesh[] = [];
  private entityObjects = new Array(2048);
  private voxelGridOffset: Vector | null = null;
  private prevBluePortalPos: Vector | null = null;
  private prevOrangePortalPos: Vector | null = null;

  resetSceneEntities () {
    for (let i = 0; i < 2048; i++) {
      if (this.entityObjects[i]?.renderable) {
        this.scene.remove(this.entityObjects[i].renderable);
      }
      this.entityObjects[i] = {
        entity: null,
        renderable: null
      };
    }
  }
  resetSceneWalls () {
    for (let i = 0; i < this.wallObjects.length; i++) {
      this.scene.remove(this.wallObjects[i]);
    }
    this.wallObjects.length = 0;
  }


  addVoxelPoint (point: Vector, voxels: Map<string, Vector>) {
    const voxelPosition = point
      .Sub(this.voxelGridOffset || new Vector())
      .map(c => Math.floor(c / VOXEL_SIZE));
    const voxelKey = `${voxelPosition.x};${voxelPosition.y};${voxelPosition.z}`;
    if (voxels.has(voxelKey)) return;
    voxels.set(voxelKey, voxelPosition);
  }

  addVoxelsAlongRay (start: Vector, end: Vector, voxels: Map<string, Vector>) {
    const gx0 = (start.x - (this.voxelGridOffset?.x || 0)) / VOXEL_SIZE;
    const gy0 = (start.y - (this.voxelGridOffset?.y || 0)) / VOXEL_SIZE;
    const gz0 = (start.z - (this.voxelGridOffset?.z || 0)) / VOXEL_SIZE;

    const gx1 = (end.x - (this.voxelGridOffset?.x || 0)) / VOXEL_SIZE;
    const gy1 = (end.y - (this.voxelGridOffset?.y || 0)) / VOXEL_SIZE;
    const gz1 = (end.z - (this.voxelGridOffset?.z || 0)) / VOXEL_SIZE;

    const dx = gx1 - gx0;
    const dy = gy1 - gy0;
    const dz = gz1 - gz0;

    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const stepZ = Math.sign(dz);

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

    let tMaxX = stepX !== 0 ? (stepX > 0 ? (Math.floor(gx0) + 1 - gx0) : (gx0 - Math.floor(gx0))) * tDeltaX : Infinity;
    let tMaxY = stepY !== 0 ? (stepY > 0 ? (Math.floor(gy0) + 1 - gy0) : (gy0 - Math.floor(gy0))) * tDeltaY : Infinity;
    let tMaxZ = stepZ !== 0 ? (stepZ > 0 ? (Math.floor(gz0) + 1 - gz0) : (gz0 - Math.floor(gz0))) * tDeltaZ : Infinity;

    let x = Math.floor(gx0);
    let y = Math.floor(gy0);
    let z = Math.floor(gz0);

    let key = `${x};${y};${z}`;
    if (!voxels.has(key)) voxels.set(key, new Vector(x, y, z));

    while (true) {
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          if (tMaxX > 1) break;
          x += stepX;
          tMaxX += tDeltaX;
        } else {
          if (tMaxZ > 1) break;
          z += stepZ;
          tMaxZ += tDeltaZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          if (tMaxY > 1) break;
          y += stepY;
          tMaxY += tDeltaY;
        } else {
          if (tMaxZ > 1) break;
          z += stepZ;
          tMaxZ += tDeltaZ;
        }
      }

      key = `${x};${y};${z}`;
      if (!voxels.has(key)) voxels.set(key, new Vector(x, y, z));
    }
  }

  collectPoints (demo: Demo, voxels: Map<string, Vector>, portalVoxels: Map<string, Vector>) {
    const { entities } = demo.state;
    if (!entities) return;

    if (this.voxelGridOffset === null) {
      // The first door is usually a decent anchor for a map's "grid"
      const door = entities.FindByClassname(null, "prop_testchamber_door");
      if (!door) this.voxelGridOffset = new Vector();
      else {
        const doorPosition = door.GetOrigin();
        const doorForward = door.GetForwardVector();
        this.voxelGridOffset = doorPosition
          .Add(doorForward.Scale(-16))
          .map(c => c % 64);
      }
    }

    for (const entity of entities) {
      if (!entity) continue;

      const ang = entity.GetAngles(true);

      const classname = entity.GetClassname();
      if (classname === "player") {
        ang.x = 0;
        ang.y = 0;
      }
      if (classname === "weapon_portalgun" && entity.GetOwner()) {
        const lastPortal = entity.GetProperty("m_iLastFiredPortal");
        if (lastPortal === 0) continue;
        const viewOrigin = demo.state.players[0].viewOrigin.Add(new Vector(0, 0, 56));
        if (lastPortal === 1) {
          const bluePortalPos = entity.GetProperty("m_vecBluePortalPos");
          if (!(bluePortalPos instanceof Vector)) continue;
          if (!this.prevBluePortalPos || bluePortalPos.Sub(this.prevBluePortalPos).LengthSqr() > 1e-6) {
            this.prevBluePortalPos = bluePortalPos;
            this.addVoxelsAlongRay(viewOrigin, bluePortalPos, voxels);
          }
        } else {
          const orangePortalPos = entity.GetProperty("m_vecOrangePortalPos");
          if (!(orangePortalPos instanceof Vector)) continue;
          if (!this.prevOrangePortalPos || orangePortalPos.Sub(this.prevOrangePortalPos).LengthSqr() > 1e-6) {
            this.prevOrangePortalPos = orangePortalPos;
            this.addVoxelsAlongRay(viewOrigin, orangePortalPos, voxels);
          }
        }
        continue;
      }

      const { forward, up } = ang.FromAngles();
      const right = up.Cross(forward);
      let pos = entity.GetOrigin();

      if (pos.LengthSqr() === 0) continue;

      const mins = entity.GetBoundingMins().Scale(0.8);
      const maxs = entity.GetBoundingMaxs().Scale(0.8);

      let addTo = voxels;
      if (classname === "prop_portal") {
        pos = pos.Sub(forward.Scale(VOXEL_SIZE - 1));
        maxs.x = 0;
        addTo = portalVoxels;
      }

      if (mins.LengthSqr() === 0 && maxs.LengthSqr() === 0) {
        this.addVoxelPoint(pos, addTo);
        continue;
      }

      for (const x of [mins.x, maxs.x]) {
        for (const y of [mins.y, maxs.y]) {
          for (const z of [mins.z, maxs.z]) {
            const point = pos
              .Add(forward.Scale(x))
              .Add(right.Scale(-y))
              .Add(up.Scale(z));
            this.addVoxelPoint(point, addTo);
          }
        }
      }
    }
  }

  buildWalls (voxels: Map<string, Vector>, portalVoxels: Map<string, Vector>) {
    const directions = [
      new Vector(1, 0, 0),
      new Vector(-1, 0, 0),
      new Vector(0, 1, 0),
      new Vector(0, -1, 0),
      new Vector(0, 0, 1),
      new Vector(0, 0, -1)
    ];

    for (const [key, _position] of portalVoxels) {
      voxels.delete(key);
    }

    for (const [_key, position] of voxels) {
      for (let i = 0; i < directions.length; i++) {
        const neighbor = position.Add(directions[i]);
        const neighborKey = `${neighbor.x};${neighbor.y};${neighbor.z}`;
        if (voxels.has(neighborKey)) continue;

        const isPortalable = portalVoxels.has(neighborKey);

        const meshCenterPosition = position
          .Scale(VOXEL_SIZE)
          .Add(directions[i].Scale(VOXEL_SIZE_HALF))
          .Add(new Vector(VOXEL_SIZE_HALF, VOXEL_SIZE_HALF, VOXEL_SIZE_HALF))
          .Add(this.voxelGridOffset || new Vector());
        const meshFacing = meshCenterPosition
          .Sub(directions[i]);

        const wallMesh = new THREE.Mesh(wallGeometry, isPortalable ? wallPortalMaterial : wallMaterial);
        wallMesh.position.copy(toThreeVector(meshCenterPosition));
        wallMesh.lookAt(toThreeVector(meshFacing));

        this.wallObjects.push(wallMesh);
        this.scene.add(wallMesh);
      }
    }
  }


  async playbackTickHandler (demo: Demo) {

    const { entities } = demo.state;
    if (!entities) return;

    const { viewOrigin, viewAngles } = demo.state.players[0];
    this.camera.position.copy(toThreeVector(viewOrigin.Add(new Vector(0, 0, 56))));
    rotateFromSourceAngles(this.camera, viewAngles);
    this.pointLight.position.copy(this.camera.position);

    for (let i = 2; i < entities.length; i ++) {
      const object = this.entityObjects[i];
      const entity = entities[i];

      // Entity no longer exists, mesh hasn't been cleared yet
      if (!entity && object.entity) {
        object.entity = null;
        this.scene.remove(object.renderable);
        continue;
      }
      // Entity doesn't exist, neither does mesh
      if (!entity) continue;

      const model = entity.GetModelName();
      const classname = entity.GetClassname();

      if (!model) continue;
      if (classname === "weapon_portalgun") continue;

      const isBrush = classname.startsWith("func_");

      const pos = entity.GetOrigin();
      const ang = entity.GetAngles();

      // Mesh being drawn does not correspond to this entity
      if (object.entity !== entity) {

        const modelBuilder = getModelBuilder(model);
        if (modelBuilder) {
          if (classname === "phys_bone_follower") {
            continue;
          }
          object.renderable = modelBuilder();
          this.scene.add(object.renderable);
        } else {
          const center = entity.GetCenter();
          const mins = entity.GetBoundingMins();
          const maxs = entity.GetBoundingMaxs();
          const size = maxs.Sub(mins);

          const geometry = new THREE.BoxGeometry(size.y, size.z, size.x);
          const offset = toThreeVector(center.Sub(pos));
          geometry.translate(offset.x, offset.y, offset.z);
          object.renderable = new THREE.Mesh(geometry, isBrush ? brushMaterial : propMaterial);

          if (object.renderable) {
            this.scene.remove(object.renderable);
          }
          this.scene.add(object.renderable);
        }
      }

      object.entity = entity;

      object.renderable.position.copy(toThreeVector(pos));
      rotateFromSourceAngles(object.renderable, ang);

    }

  }

  async init () {

    this.renderer.setSize(this.renderBounds.width, this.renderBounds.height);
    this.scene.add(this.ambientLight);
    this.scene.add(this.pointLight);

    this.ready = true;
  }

  async doConvert (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    if (!this.ready) throw "Handler not initialized!";
    if (inputFormat.format !== "dem") throw "Invalid input format!";

    let frameIndex = 0;

    for (const inputFile of inputFiles) {

      const voxels: Map<string, Vector> = new Map();
      const portalVoxels: Map<string, Vector> = new Map();

      if (outputFormat.format !== "json") {
        this.resetSceneWalls();
        this.voxelGridOffset = null;
      }

      const demo: Demo = await new Promise(resolve => {
        new Demo(inputFile.bytes, {
          onTick: (demo) => this.collectPoints(demo, voxels, portalVoxels),
          onFinish: resolve
        });
      });

      if (outputFormat.format === "json") {
        const encoder = new TextEncoder();
        const string = JSON.stringify(demo, getJsonReplacer(), 2);
        const bytes = encoder.encode(string);
        const name = inputFile.name.split(".")[0] + ".json";
        outputFiles.push({ bytes, name });
        continue;
      }

      this.buildWalls(voxels, portalVoxels);
      this.resetSceneEntities();

      await new Promise(resolve => {
        new Demo(inputFile.bytes, {
          onTick: async (demo: Demo) => {
            await this.playbackTickHandler(demo);
            this.renderer.render(this.scene, this.camera);

            const bytes: Uint8Array = await new Promise((resolve, reject) => {
              this.renderer.domElement.toBlob((blob) => {
                if (!blob) return reject("Canvas output failed");
                blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
              }, outputFormat.mime);
            });
            const name = inputFile.name.split(".")[0] + "_" + frameIndex + "." + outputFormat.extension;
            outputFiles.push({ bytes, name });

            frameIndex ++;
          },
          onFinish: resolve
        });
      });

    }

    return outputFiles;
  }

}

export default sppdHandler;