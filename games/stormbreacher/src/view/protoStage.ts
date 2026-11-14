// The light and shadow around the prototype mech (SB-1468): a warm sun that casts the mech's shadow onto the beach, a
// cool edge light behind it, and the surroundings' light from a small room, so the metal has something to reflect. The
// confirmation view (#view-mech?proto) always builds it; the sortie builds it only for ?shadow=1 or ?env=1 (SB-1473:
// both are off by default, and their weight is measured in SB-1474). Dispose puts the renderer and the map back.
import * as THREE from 'three';
import { renderer, scene } from '@engine/render/index.ts';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MECH_PROTO_LIGHT_COLOR } from '../data/colors.ts';
import { PROTO_TUNE } from '../data/mechProto.ts';
import { MECH_TUNE } from '../data/tune.ts';

export interface ProtoStage {
  shadowOn: boolean;
  envOn: boolean;
  setShadow(on: boolean): void;
  setEnv(on: boolean): void;
  follow(x: number, z: number): void; // moves the lights and the shadow's camera to where the mech stands now
  dispose(): void;
}

// The map's meshes get receiveShadow while the stage is up, so the sand and the props take the mech's shadow.
function mark(map: THREE.Object3D, on: boolean): THREE.Mesh[] {
  const touched: THREE.Mesh[] = [];
  map.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    mesh.receiveShadow = on;
    touched.push(mesh);
  });
  return touched;
}

export function addProtoStage(mech: THREE.Object3D, map: THREE.Object3D, x: number, z: number): ProtoStage {
  const height = MECH_TUNE.height;
  const light = PROTO_TUNE.light;
  const extent = light.shadow.extent * height;

  const place = (light: THREE.DirectionalLight, at: readonly number[], x: number, z: number): void => {
    light.position.set(x + at[0] * height, at[1] * height, z + at[2] * height);
    light.target.position.set(x, height * 0.5, z);
  };

  const sun = new THREE.DirectionalLight(MECH_PROTO_LIGHT_COLOR.key, light.key.intensity);
  place(sun, light.key.at, x, z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(light.shadow.mapSize, light.shadow.mapSize);
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.camera.near = light.shadow.near * height;
  sun.shadow.camera.far = light.shadow.far * height;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = light.shadow.bias;
  scene.add(sun, sun.target);

  const rim = new THREE.DirectionalLight(MECH_PROTO_LIGHT_COLOR.rim, light.rim.intensity);
  place(rim, light.rim.at, x, z);
  scene.add(rim, rim.target);

  const fill = new THREE.DirectionalLight(MECH_PROTO_LIGHT_COLOR.fill, light.fill.intensity);
  place(fill, light.fill.at, x, z);
  scene.add(fill, fill.target);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTarget = pmrem.fromScene(room, 0.04);
  scene.environment = envTarget.texture;

  const receivers = mark(map, true);

  const refresh = (): void => {
    for (const root of [mech, ...receivers]) {
      root.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh !== true) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) material.needsUpdate = true;
      });
    }
  };

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.needsUpdate = true;
  mech.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  const stage: ProtoStage = {
    shadowOn: true,
    envOn: true,
    setShadow(on: boolean): void {
      stage.shadowOn = on;
      sun.castShadow = on;
      renderer.shadowMap.enabled = on;
      renderer.shadowMap.needsUpdate = true;
      refresh();
    },
    setEnv(on: boolean): void {
      stage.envOn = on;
      scene.environment = on ? envTarget.texture : null;
      refresh();
    },
    follow(fx: number, fz: number): void {
      place(sun, light.key.at, fx, fz);
      place(rim, light.rim.at, fx, fz);
      place(fill, light.fill.at, fx, fz);
    },
    dispose(): void {
      scene.remove(sun, sun.target, rim, rim.target, fill, fill.target);
      if (scene.environment === envTarget.texture) scene.environment = null;
      envTarget.dispose();
      room.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh !== true) return;
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) material.dispose();
      });
      pmrem.dispose();
      mark(map, false);
      renderer.shadowMap.enabled = false;
      renderer.shadowMap.needsUpdate = true;
      refresh();
    },
  };
  return stage;
}
