// The infantry who ride in on the landing craft (SB-1640), as the screen draws them: the battle's own boxes for the body
// and the head, at the deck's height. They stand until a `riders` event names them and then lie down as the battle's
// fallen do. The view reads the cutscene's table and never writes the game.
import * as THREE from 'three';
import { disposeTree, scene } from '@engine/render/index.ts';
import { CRAFT_TUNE } from '../data/craft.ts';
import type { CutsceneEvent } from '../data/cutscenes.ts';
import { LANDING_RIDERS } from '../data/landing.ts';
import { SOLDIER_POSE } from '../data/soldiers.ts';
import { riderFall } from '../logic/cutscene.ts';
import { soldierMeshes } from './battle/parts.ts';

export const RIDERS_NAME = 'sbRiders';

export interface RidersView {
  group: THREE.Group;
  bodies: THREE.InstancedMesh;
  heads: THREE.InstancedMesh;
}

const dummy = new THREE.Object3D();

// Builds the riders' two instanced meshes at the deck's height and puts them in the scene, out of sight.
export function buildRiders(): RidersView {
  const { bodies, heads } = soldierMeshes(LANDING_RIDERS.length);
  const group = new THREE.Group();
  group.name = RIDERS_NAME;
  group.add(bodies, heads);
  group.visible = false;
  scene.add(group);
  for (const mesh of [bodies, heads]) {
    mesh.count = LANDING_RIDERS.length;
    mesh.visible = true;
  }
  return { group, bodies, heads };
}

// Puts every rider where the table says: standing at the deck, or lying down by riderFall(id, elapsed, events). The body
// turns about x as it falls and the head ends `headForward` past the body, as the battle's fallen soldiers do.
export function drawRiders(view: RidersView, elapsed: number, events: readonly CutsceneEvent[]): void {
  for (let i = 0; i < LANDING_RIDERS.length; i++) {
    const rider = LANDING_RIDERS[i];
    const p = riderFall(rider.id, elapsed, events);
    const fx = -Math.sin(rider.yaw);
    const fz = -Math.cos(rider.yaw);
    dummy.rotation.set((Math.PI / 2) * p, rider.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(
      rider.x,
      CRAFT_TUNE.deckTop + SOLDIER_POSE.bodyY + (SOLDIER_POSE.bodyDeadY - SOLDIER_POSE.bodyY) * p,
      rider.z,
    );
    dummy.updateMatrix();
    view.bodies.setMatrixAt(i, dummy.matrix);
    dummy.position.set(
      rider.x + fx * SOLDIER_POSE.headForward * p,
      CRAFT_TUNE.deckTop + SOLDIER_POSE.headY + (SOLDIER_POSE.headDeadY - SOLDIER_POSE.headY) * p,
      rider.z + fz * SOLDIER_POSE.headForward * p,
    );
    dummy.rotation.set((Math.PI / 2) * p, rider.yaw, (Math.PI / 2) * p);
    dummy.updateMatrix();
    view.heads.setMatrixAt(i, dummy.matrix);
  }
  view.bodies.instanceMatrix.needsUpdate = true;
  view.heads.instanceMatrix.needsUpdate = true;
}

// Takes the riders out of the scene and gives back their geometry and materials.
export function removeRiders(view: RidersView): void {
  scene.remove(view.group);
  view.group.traverse(object => {
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  disposeTree(view.group);
}
