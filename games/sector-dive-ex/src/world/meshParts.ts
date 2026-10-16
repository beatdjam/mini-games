import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { UP } from '@engine/render/render.ts';
import {
  addCeiling as addPlainCeiling,
  addDecks as addPlainDecks,
  addFloor as addPlainFloor,
  addRamps as addPlainRamps,
  addWalls as addPlainWalls,
} from '@engine/render/tilemesh.ts';
import { SIDE_STEP, T, isSolid } from '@engine/world/tiles.ts';
import { WALL_H } from '../data/level.ts';
import type { Biome } from '../data/types.ts';
import { COLOR } from '../data/colors.ts';
import type { BiomeTextures } from './render.ts';
// The pieces a level's meshes are made of (world/levelMesh.ts puts them together): the floor, the walls, the raised
// decks and ramps, the ceiling (engine/src/render/tilemesh.ts, given this game's pictures and heights), and the neon
// signs. They read the tile world being built
export { addTilePlanes, touchesFloor, wallTiles } from '@engine/render/tilemesh.ts';
const NEON_COUNT = 90; // neon signs per level
// a ramp's sides are cut into this many slices, so they take a deck's side picture the way a deck does (where a ramp
// meets the deck it climbs to, the two sides are the same): engine wedgeGeo
const WEDGE_SLICES = 8;
const COVER_TINT = 0x9a9a9a; // the sides of cover are the wall's picture, darkened by this

export function addFloor(tex: BiomeTextures, group: THREE.Group) {
  addPlainFloor(tex.floor, group);
}
export function addWalls(wallTex: THREE.Texture, tiles: [number, number][], group: THREE.Group) {
  addPlainWalls(wallTex, tiles, WALL_H, group);
}
// raised decks, walkways and cover: their sides in `side` (or the wall's picture)
export function addDecks(tex: BiomeTextures, group: THREE.Group, side?: THREE.Texture) {
  addPlainDecks({ top: tex.tile, side: side ?? tex.wall, cover: tex.wall, coverTint: COVER_TINT }, group);
}
// ramps; their sides in the same picture as the decks' (`side`, or the wall's)
export function addRamps(tex: BiomeTextures, group: THREE.Group, side?: THREE.Texture) {
  addPlainRamps(tex.tile, side ?? tex.wall, WEDGE_SLICES, group);
}
export function addCeiling(biome: Biome, group: THREE.Group) {
  addPlainCeiling(new THREE.Color(biome.wall).multiplyScalar(0.7), WALL_H, group);
}

// neon signs on the open sides of wall tiles; rng picks which sides get one, then each sign's height, size and colour
export function addNeonSigns(tiles: [number, number][], group: THREE.Group, rng: Rng) {
  const matrix = new THREE.Matrix4();
  const spots: [number, number, number, number][] = [];
  tiles.forEach(([i, j]) =>
    SIDE_STEP.forEach(([dx, dz]) => {
      if (!isSolid(i + dx, j + dz)) spots.push([i, j, dx, dz]);
    }),
  );
  const pickSpots = rng.shuffle(spots).slice(0, NEON_COUNT),
    colors = [COLOR.neonPink, COLOR.neonMint, COLOR.neonGold, COLOR.neonSky, COLOR.violet];
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
