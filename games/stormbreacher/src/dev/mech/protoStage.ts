// The light and shadow the confirmation view (#view-mech?proto) puts around the prototype (SB-1468): a warm sun that
// casts the mech's shadow onto the beach, a cool edge light behind it, and the surroundings' light from a small room, so
// the metal has something to reflect. The sortie keeps its own lights (view/look.ts); nothing here runs outside the dev
// view, and dispose puts the renderer and the map back.
import * as THREE from 'three';
import { renderer, scene } from '@engine/render/index.ts';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MECH_PROTO_LIGHT_COLOR } from '../../data/colors.ts';
import { PROTO_TUNE } from '../../data/mechProto.ts';
import { MECH_TUNE } from '../../data/tune.ts';

export interface ProtoStage {
  shadowOn: boolean;
  envOn: boolean;
  setShadow(on: boolean): void;
  setEnv(on: boolean): void;
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

  const sun = new THREE.DirectionalLight(MECH_PROTO_LIGHT_COLOR.key, light.key.intensity);
  sun.position.set(x + light.key.at[0] * height, light.key.at[1] * height, z + light.key.at[2] * height);
  sun.target.position.set(x, height * 0.5, z);
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
  rim.position.set(x + light.rim.at[0] * height, light.rim.at[1] * height, z + light.rim.at[2] * height);
  rim.target.position.set(x, height * 0.5, z);
  scene.add(rim, rim.target);

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
    dispose(): void {
      scene.remove(sun, sun.target, rim, rim.target);
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
