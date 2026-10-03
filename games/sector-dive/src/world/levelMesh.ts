import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { UP } from '@engine/render/render.ts';
import {
  H,
  RISE,
  SIDE_STEP,
  T,
  W,
  cover,
  grid,
  hgt,
  inBounds,
  isSolid,
  ramp,
  tileCenter,
} from '@engine/world/tiles.ts';
import { WALL_H } from '../data/level.ts';
import type { Biome } from '../data/types.ts';
import { COLOR } from '../data/colors.ts';
import { biomeTex } from './render.ts';
import type { BiomeTextures } from './render.ts';
import { buildHazardMesh } from './hazards.ts';
import type { GeneratedLevel } from './levelGen.ts';
const NEON_COUNT = 90; // neon signs per level

// wedge rising toward +x across one tile; rotated per ramp direction
export function wedgeGeo() {
  type P3 = [number, number, number];
  const a = T / 2,
    r = RISE,
    pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const quad = (p0: P3, p1: P3, p2: P3, p3: P3) => {
    const b = pos.length / 3;
    pos.push(...p0, ...p1, ...p2, ...p3);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const tri = (p0: P3, p1: P3, p2: P3) => {
    const b = pos.length / 3;
    pos.push(...p0, ...p1, ...p2);
    uv.push(0, 0, 1, 0, 1, 1);
    idx.push(b, b + 1, b + 2);
  };
  quad([-a, 0, -a], [a, r, -a], [a, r, a], [-a, 0, a]);
  quad([a, 0, -a], [a, 0, a], [a, r, a], [a, r, -a]);
  tri([-a, 0, -a], [a, 0, -a], [a, r, -a]);
  tri([-a, 0, a], [a, r, a], [a, 0, a]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, 6, 0);
  g.addGroup(6, 12, 1);
  return g;
}
export const RAMP_ROT = [0, Math.PI, -Math.PI / 2, Math.PI / 2];

// does a floor tile (grid 1) lie within the 8 tiles around (i, j), or on it
function touchesFloor(i: number, j: number): boolean {
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const ni = i + di,
        nj = j + dj;
      if (inBounds(ni, nj) && grid[nj * W + ni] === 1) return true;
    }
  return false;
}

// the solid tiles that touch a floor tile: the only walls that can be seen
function wallTiles(): [number, number][] {
  const tiles: [number, number][] = [];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (grid[j * W + i] === 1) continue;
      if (touchesFloor(i, j)) tiles.push([i, j]);
    }
  return tiles;
}

function addFloor(tex: BiomeTextures, group: THREE.Group) {
  tex.floor.repeat.set(W, H);
  const geo = new THREE.PlaneGeometry(W * T, H * T);
  geo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex.floor }));
  floor.position.set((W * T) / 2, 0, (H * T) / 2);
  group.add(floor);
}

function addWalls(tex: BiomeTextures, tiles: [number, number][], group: THREE.Group) {
  const matrix = new THREE.Matrix4();
  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(T, WALL_H, T),
    new THREE.MeshBasicMaterial({ map: tex.wall }),
    tiles.length,
  );
  tiles.forEach(([i, j], n) => {
    matrix.makeTranslation(tileCenter(i), WALL_H / 2, tileCenter(j));
    walls.setMatrixAt(n, matrix);
  });
  walls.instanceMatrix.needsUpdate = true;
  group.add(walls);
}

// raised decks, walkways and cover (not ramps): one box per tile, scaled to the tile height
function addDecks(tex: BiomeTextures, group: THREE.Group) {
  const matrix = new THREE.Matrix4();
  const raised: number[] = [];
  for (let k = 0; k < W * H; k++) if (grid[k] === 1 && ramp[k] < 0 && hgt[k] > 0) raised.push(k);
  const sideMat = new THREE.MeshBasicMaterial({ map: tex.wall }),
    topMat = new THREE.MeshBasicMaterial({ map: tex.tile });
  const coverSideMat = new THREE.MeshBasicMaterial({ map: tex.wall, color: 0x9a9a9a });
  (
    [
      [raised.filter(k => !cover[k]), sideMat],
      [raised.filter(k => cover[k]), coverSideMat],
    ] as [number[], THREE.Material][]
  ).forEach(([tiles, mat]) => {
    if (!tiles.length) return;
    const geo = new THREE.BoxGeometry(T, 1, T);
    geo.translate(0, 0.5, 0);
    const decks = new THREE.InstancedMesh(geo, [mat, mat, topMat, mat, mat, mat], tiles.length);
    tiles.forEach((k, n) => {
      matrix.makeScale(1, hgt[k], 1);
      matrix.setPosition(tileCenter(k % W), 0, tileCenter((k / W) | 0));
      decks.setMatrixAt(n, matrix);
    });
    decks.instanceMatrix.needsUpdate = true;
    group.add(decks);
  });
}

function addRamps(tex: BiomeTextures, group: THREE.Group) {
  const topMat = new THREE.MeshBasicMaterial({ map: tex.tile, side: THREE.DoubleSide }),
    sideMat = new THREE.MeshBasicMaterial({ map: tex.wall, side: THREE.DoubleSide });
  const geo = wedgeGeo();
  for (let k = 0; k < W * H; k++) {
    if (grid[k] !== 1 || ramp[k] < 0) continue;
    const mesh = new THREE.Mesh(geo, [topMat, sideMat]);
    mesh.position.set(tileCenter(k % W), hgt[k], tileCenter((k / W) | 0));
    mesh.rotation.y = RAMP_ROT[ramp[k]];
    group.add(mesh);
  }
}

function addCeiling(biome: Biome, group: THREE.Group) {
  const geo = new THREE.PlaneGeometry(W * T, H * T);
  geo.rotateX(Math.PI / 2);
  const ceiling = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: new THREE.Color(biome.wall).multiplyScalar(0.7) }),
  );
  ceiling.position.set((W * T) / 2, WALL_H, (H * T) / 2);
  group.add(ceiling);
}

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
  addFloor(tex, group);
  addWalls(tex, walls, group);
  addDecks(tex, group);
  addRamps(tex, group);
  buildHazardMesh(biome, gen.hazard, group);
  // sectors with gen.ceiling / gen.neon
  if (biome.gen.ceiling && !isArena) addCeiling(biome, group);
  if (biome.gen.neon && !isArena) addNeonSigns(walls, group, rng);
}
