import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { UP } from '@engine/render/render.ts';
import { addCeiling, addDecks, addFloor, addRamps, addWalls, wallTiles } from '@engine/render/tilemesh.ts';
import { SIDE_STEP, T, isSolid } from '@engine/world/tiles.ts';
import { WALL_H } from '../data/level.ts';
import type { Biome } from '../data/types.ts';
import { COLOR } from '../data/colors.ts';
import { biomeTex } from './render.ts';
import { buildHazardMesh } from './hazards.ts';
import type { GeneratedLevel } from './levelGen.ts';
const NEON_COUNT = 90; // neon signs per level
const COVER_TINT = 0x9a9a9a; // the sides of cover are the wall's picture, darkened by this

// neon signs on the open sides of wall tiles; rng picks which sides get one, then each sign's height, size and colour
function addNeonSigns(tiles: [number, number][], group: THREE.Group, rng: Rng) {
  const matrix = new THREE.Matrix4();
  const spots: [number, number, number, number][] = [];
  tiles.forEach(([i, j]) =>
    SIDE_STEP.forEach(([dx, dz]) => {
      if (!isSolid(i + dx, j + dz)) spots.push([i, j, dx, dz]);
    }),
  );
  const pickSpots = rng.shuffle(spots).slice(0, NEON_COUNT),
    colors = [0xff3d8a, 0x3dffb4, 0xffd23d, 0x4dc3ff, COLOR.violet];
  const signs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(T * 0.55, 0.45, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    pickSpots.length,
  );
  const rotation = new THREE.Quaternion(),
    scale = new THREE.Vector3(1, 1, 1),
    color = new THREE.Color();
  pickSpots.forEach(([i, j, dx, dz], n) => {
    rotation.setFromAxisAngle(UP, dx !== 0 ? Math.PI / 2 : 0);
    matrix.compose(
      new THREE.Vector3((i + 0.5 + dx * 0.52) * T, rng.rand(2.4, 4.8), (j + 0.5 + dz * 0.52) * T),
      rotation,
      scale.set(rng.rand(0.5, 1.2), rng.rand(0.7, 1.6), 1),
    );
    signs.setMatrixAt(n, matrix);
    signs.setColorAt(n, color.setHex(rng.pick(colors)));
  });
  signs.instanceMatrix.needsUpdate = true;
  if (signs.instanceColor) signs.instanceColor.needsUpdate = true;
  group.add(signs);
}

// The three.js part of a level: floor, walls, decks, ramps, cover, hazard floor, ceiling and neon signs. Reads the
// tile world (set from gen first). rng only places the signs, so the same seed gives the same look.
export function buildLevelMeshes(biome: Biome, isArena: boolean, gen: GeneratedLevel, group: THREE.Group, rng: Rng) {
  const tex = biomeTex(biome);
  const walls = wallTiles();
  // the floor, walls, decks and ramps of the tile world (engine/src/render/tilemesh.ts); a ramp's sides are one
  // triangle each, the picture stretched over it
  addFloor(tex.floor, group);
  addWalls(tex.wall, walls, WALL_H, group);
  addDecks({ top: tex.tile, side: tex.wall, cover: tex.wall, coverTint: COVER_TINT }, group);
  addRamps(tex.tile, tex.wall, 0, group);
  buildHazardMesh(biome, gen.hazard, group);
  // sectors with gen.ceiling / gen.neon
  if (biome.gen.ceiling && !isArena) addCeiling(new THREE.Color(biome.wall).multiplyScalar(0.7), WALL_H, group);
  if (biome.gen.neon && !isArena) addNeonSigns(walls, group, rng);
}
