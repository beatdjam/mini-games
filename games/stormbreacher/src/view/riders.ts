// The infantry droids who ride in on the landing craft (SB-1640, droids SB-1745), as the screen draws them: the
// battle's own body, head and lit parts, at the deck's height. They stand until a `riders` event names them and then lie
// down as the battle's fallen do. The view reads the cutscene's table and never writes the game.
import * as THREE from 'three';
import { disposeTree, scene } from '@engine/render/index.ts';
import { CRAFT_TUNE } from '../data/craft.ts';
import type { CutsceneEvent } from '../data/cutscenes.ts';
import { LANDING_RIDERS } from '../data/landing.ts';
import { riderFall } from '../logic/cutscene.ts';
import { soldierMeshes } from './battle/parts.ts';
import { droidMatricesChanged, showDroid, writeDroid, type DroidMeshes } from './droidPose.ts';

export const RIDERS_NAME = 'sbRiders';

export interface RidersView {
  group: THREE.Group;
  meshes: DroidMeshes;
}

// Builds the riders' instanced meshes at the deck's height and puts them in the scene, out of sight.
export function buildRiders(): RidersView {
  const meshes = soldierMeshes(LANDING_RIDERS.length);
  const group = new THREE.Group();
  group.name = RIDERS_NAME;
  group.add(meshes.bodies, meshes.heads);
  group.visible = false;
  scene.add(group);
  showDroid(meshes, LANDING_RIDERS.length);
  return { group, meshes };
}

// Puts every rider where the table says: standing at the deck, or lying down by riderFall(id, elapsed, events). The body
// turns onto its back as it falls, the head riding the top of its neck, as the battle's fallen droids do.
export function drawRiders(view: RidersView, elapsed: number, events: readonly CutsceneEvent[]): void {
  for (let i = 0; i < LANDING_RIDERS.length; i++) {
    const rider = LANDING_RIDERS[i];
    writeDroid(view.meshes, i, rider.x, CRAFT_TUNE.deckTop, rider.z, rider.yaw, riderFall(rider.id, elapsed, events));
  }
  droidMatricesChanged(view.meshes);
}

// Takes the riders out of the scene and gives back their geometry and materials.
export function removeRiders(view: RidersView): void {
  scene.remove(view.group);
  view.group.traverse(object => {
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  disposeTree(view.group);
}
