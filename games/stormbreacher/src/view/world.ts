// The map as the screen draws it: the ground tiles and props, the mission's targets, and the fog and camera range they
// are seen through. The game and the dev views that walk a map both build it from here.
import * as THREE from 'three';
import { camera, scene } from '@engine/render/index.ts';
import { SKY_COLOR } from '../data/colors.ts';
import { TILE_SIZE } from '../data/props.ts';
import type { MapBounds, MapDef, Prop } from '../data/types.ts';
import type { GameModel } from '../logic/game.ts';
import { buildOutdoor, buildTargets, type OutdoorBuild } from './outdoor.ts';

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

  return { built, targets, targetGroup };
}

// Lowers and darkens every target whose health is gone. Called every frame, so one already down is left as it is: the
// scale says a wreck has been made.
export function syncWorld(world: World, game: GameModel): void {
  for (const target of game.targets) {
    if (target.hp > 0) continue;
    const mesh = world.targets.get(target.id);
    if (!mesh || mesh.scale.y === WRECK_SCALE_Y) continue;
    if (mesh.material instanceof THREE.MeshLambertMaterial) mesh.material.color.setHex(WRECK_COLOR);
    mesh.scale.y = WRECK_SCALE_Y;
  }
}
