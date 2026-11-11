// The map as the screen draws it: the ground tiles and props, the mission's targets, and the fog and camera range they
// are seen through. The game and the dev views that walk a map both build it from here.
import * as THREE from 'three';
import { camera, scene } from '@engine/render/index.ts';
import { SKY_COLOR } from '../data/colors.ts';
import { TILE_SIZE } from '../data/props.ts';
import type { MapBounds, MapDef, Prop } from '../data/types.ts';
import type { GameModel } from '../logic/game.ts';
import { blockingPropIndexes, mapBlockers } from '../logic/mapShapes.ts';
import { cameraBoxes } from './camera.ts';
import { breakPropSlot, buildOutdoor, buildTargets, type OutdoorBuild, type PropSlot } from './outdoor.ts';

const FOG_NEAR = 100; // m
const FOG_FAR = 240; // m; the map is 230 m deep
const CHUNK = 32; // m
const CHUNK_MIN = 3000; // triangles
const WRECK_COLOR = 0x1f1c18; // the colour a broken target keeps
const WRECK_SCALE_Y = 0.35; // how low a broken target sits (its height scale)

// The fog's numbers the map views set; #view-fx starts from the same ones when its own look is off.
export const MAP_FOG = { near: FOG_NEAR, far: FOG_FAR } as const;

export interface World {
  built: OutdoorBuild; // the ground and props, and their chunks
  targets: Map<string, THREE.Mesh>; // the mission's targets by id
  targetGroup: THREE.Group; // every target, to take out when the world is built again
  cameraBoxes: THREE.Box3[]; // the props and targets as walls the camera keeps out of
  slots: Map<number, PropSlot>; // a breakable prop's place in map.props -> where it is drawn
  propCameraBoxes: Map<number, THREE.Box3>; // a breakable prop's place in map.props -> its box in cameraBoxes
  broken: Set<number>; // the props already drawn broken
}

// The tiles that cover the whole bounds. The last row and column may hang a little past the edge, so no gap is left.
export function groundTiles(bounds: MapBounds): Prop[] {
  const cols = Math.ceil((bounds.maxX - bounds.minX) / TILE_SIZE);
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / TILE_SIZE);
  const tiles: Prop[] = [];
  for (let row = 0; row < rows; row++) {
    const z = bounds.minZ + TILE_SIZE / 2 + row * TILE_SIZE;
    for (let col = 0; col < cols; col++) {
      const x = bounds.minX + TILE_SIZE / 2 + col * TILE_SIZE;
      tiles.push({ kind: 'tile', x, z, yaw: 0, scale: 0.9 + ((row + col) % 3) * 0.07 });
    }
  }
  return tiles;
}

// Builds the walkable map into the scene and returns what was built. Hiding the start-up field is left to the caller.
export function buildWorld(map: MapDef): World {
  const fog = scene.fog instanceof THREE.Fog ? scene.fog : new THREE.Fog(SKY_COLOR, FOG_NEAR, FOG_FAR);
  fog.near = FOG_NEAR;
  fog.far = FOG_FAR;
  scene.fog = fog;
  camera.far = FOG_FAR + 20;
  camera.updateProjectionMatrix();

  const built = buildOutdoor([...groundTiles(map.bounds), ...map.props], { chunk: CHUNK, chunkMin: CHUNK_MIN });
  scene.add(built.group);

  const targetGroup = buildTargets(map.targets);
  scene.add(targetGroup);
  const targets = new Map<string, THREE.Mesh>();
  for (const child of targetGroup.children) {
    if (child instanceof THREE.Mesh) targets.set(child.name, child);
  }

  // cameraBoxes runs over mapBlockers' rects, which put the blocking props first in map.props' order, so box i belongs
  // to blockingPropIndexes(map)[i]. Only the breakable props need their box kept.
  const boxes = cameraBoxes(mapBlockers(map));
  const slots = new Map<number, PropSlot>();
  const propCameraBoxes = new Map<number, THREE.Box3>();
  map.props.forEach((prop, index) => {
    const slot = built.slots.get(prop);
    if (slot) slots.set(index, slot);
  });
  blockingPropIndexes(map).forEach((propIndex, i) => {
    if (map.props[propIndex].breakable !== true) return;
    propCameraBoxes.set(propIndex, boxes[i]);
  });

  return { built, targets, targetGroup, cameraBoxes: boxes, slots, propCameraBoxes, broken: new Set() };
}

// Lowers and darkens every target whose health is gone, and every breakable prop the game has broken: its copy becomes
// a low, dark wreck and its box leaves cameraBoxes in place (play.ts hands that same array to the camera every frame).
// Called every frame, so one already down or broken is left as it is.
export function syncWorld(world: World, game: GameModel): void {
  for (const target of game.targets) {
    if (target.hp > 0) continue;
    const mesh = world.targets.get(target.id);
    if (!mesh || mesh.scale.y === WRECK_SCALE_Y) continue;
    if (mesh.material instanceof THREE.MeshLambertMaterial) mesh.material.color.setHex(WRECK_COLOR);
    mesh.scale.y = WRECK_SCALE_Y;
  }
  for (const breakable of game.breakables) {
    if (breakable.hp > 0 || world.broken.has(breakable.prop)) continue;
    const slot = world.slots.get(breakable.prop);
    if (slot) breakPropSlot(slot);
    const box = world.propCameraBoxes.get(breakable.prop);
    if (box) {
      const at = world.cameraBoxes.indexOf(box);
      if (at >= 0) world.cameraBoxes.splice(at, 1);
    }
    world.broken.add(breakable.prop);
  }
}
