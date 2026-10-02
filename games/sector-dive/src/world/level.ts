import * as THREE from 'three';
import { createRng, rand, randi } from '@engine/core/util.ts';
import { clearWorld } from '@engine/core/world.ts';
import { disposeTree, scene } from '@engine/render/render.ts';
import { clearFx } from '@engine/render/fx.ts';
import { H, T, W, computeFlow, flow, setTileWorld, tileIndex, walkable } from '@engine/world/tiles.ts';
import { tileMapFromRows } from '@engine/world/tilemap.ts';
import { clearPool } from '@engine/world/projectiles.ts';
import { BIOMES } from '../data/biomes.ts';
import type { Biome } from '../data/types.ts';
import { eBullets, enemies, pBullets, removeEnemyMesh, setBoss, setNear } from './entities.ts';
import { clearHazards } from './hazards.ts';
import { generateLevel } from './levelGen.ts';
import type { GeneratedLevel, Room } from './levelGen.ts';
import { buildLevelMeshes } from './levelMesh.ts';
import type { Portal } from './portals.ts';
// ---- tuning numbers used only here (the per-sector numbers are in data/biomes.ts gen) ----
const ARENA_FOG_NEAR = 6; // fog start in boss arenas (m)
const ARENA_FOG_FAR_MIN = 50; // fog end in boss arenas is at least this (m)
const SPOT_JITTER = 1; // random spots in a room scatter this far from the tile centre (m)
const SPOT_TRIES = 40; // attempts to find a free random spot
const REVEAL_R2 = 18; // map reveal radius around the player, squared (tiles)
const REVEAL_BOX = 4; // ... searched in this many tiles each way
// the level being played: built as a whole by buildLevel, replaced (never patched field by field) on the next one
export interface Level {
  biome: Biome; // sector of this level
  arena: boolean; // a boss arena
  rooms: Room[];
  roomOf: Int8Array; // per tile: index of the room it is in (-1 = none)
  seen: Uint8Array; // per tile: shown on the map (filled in as the player explores)
  hazardTiles: Uint8Array; // per tile: hazard floor
  roomCount: number[]; // enemies left per room (a room is cleared at 0)
  portals: Portal[];
  startIdx: number; // room index of the start
  exitIdx: number; // room index of the exit
  group: THREE.Group | null; // the three.js group holding the level's meshes
  seed: number; // what generateLevel was given; the same seed rebuilds the same level
}
function emptyLevel(): Level {
  return {
    biome: BIOMES[0],
    arena: false,
    rooms: [],
    roomOf: new Int8Array(0),
    seen: new Uint8Array(0),
    hazardTiles: new Uint8Array(0),
    roomCount: [],
    portals: [],
    startIdx: 0,
    exitIdx: 0,
    group: null,
    seed: 0,
  };
}
// replaced only by buildLevel and buildFixedLevel (and emptied piecewise by clearLevel)
export let level: Level = emptyLevel();

export function clearLevel() {
  if (level.group) {
    disposeTree(level.group);
    scene.remove(level.group);
    level.group = null;
  }
  enemies.forEach(removeEnemyMesh);
  clearWorld();
  clearPool(pBullets);
  clearPool(eBullets);
  clearFx();
  level.portals = [];
  setBoss(null);
  setNear(null);
  clearHazards();
}

// dev only (src/dev/dev.ts, ?seed=): the seed the next built levels use instead of a random one
let forcedSeed: number | null = null;
export function devSeed(seed: number | null) {
  forcedSeed = seed;
}
// the seed makes the generated level (and its signs) reproducible; tests can build a fixed level with it
export function buildLevel(biome: Biome, isArena: boolean, bossKind?: string | null, seed?: number) {
  const useSeed = seed ?? forcedSeed ?? (Math.random() * 2 ** 32) >>> 0;
  useLevel(biome, isArena, generateLevel(biome, isArena, bossKind, createRng(useSeed)), useSeed);
  if (isArena) return;
  // the exit is the room farthest (by walking) from the start
  const [sx, sz] = roomSpot(level.rooms[level.startIdx]);
  computeFlow(Math.floor(sx / T), Math.floor(sz / T));
  let best = -1;
  level.rooms.forEach((r, idx) => {
    const [x, z] = roomSpot(r),
      d = flow[tileIndex(x, z)];
    if (d > best) {
      best = d;
      level.exitIdx = idx;
    }
  });
}
// a hand-drawn level (a map written as rows of text, engine/src/world/tilemap.ts) instead of a generated one: the same
// tile world, meshes and Level, with the start and exit rooms given. For tests that need a known terrain.
export interface FixedMap {
  rows: string[];
  rooms: Room[];
  start: number; // room index of the start
  exit: number; // room index of the exit
}
export function buildFixedLevel(biome: Biome, map: FixedMap) {
  const { W, H, maps } = tileMapFromRows(map.rows, {}, map.rooms);
  useLevel(biome, false, { W, H, maps, hazard: new Uint8Array(W * H), rooms: map.rooms, startIdx: map.start }, 0);
  level.exitIdx = map.exit;
}
// the steps buildLevel and buildFixedLevel share: hand the maps to the tile world, make the Level and its meshes
function useLevel(biome: Biome, isArena: boolean, gen: GeneratedLevel, seed: number) {
  clearLevel();
  const M = gen.maps;
  setTileWorld({
    W: gen.W,
    H: gen.H,
    grid: M.grid,
    hgt: M.hgt,
    ramp: M.ramp,
    cover: M.cover,
    flow: new Int16Array(gen.W * gen.H),
    flowQ: new Int32Array(gen.W * gen.H),
  });
  const lg = new THREE.Group();
  // a new object per build; exitIdx and portals are filled in below, before anything else reads it
  level = {
    biome,
    arena: isArena,
    rooms: gen.rooms,
    roomOf: M.roomOf,
    seen: new Uint8Array(W * H),
    hazardTiles: gen.hazard,
    roomCount: new Array(gen.rooms.length).fill(0),
    portals: [],
    startIdx: gen.startIdx,
    exitIdx: 0,
    group: lg,
    seed,
  };
  scene.add(lg);
  buildLevelMeshes(biome, isArena, gen, lg, createRng(seed ^ 0x9e3779b9));
  (scene.fog as THREE.Fog).color.setHex(biome.fog);
  (scene.background as THREE.Color).setHex(biome.fog);
  (scene.fog as THREE.Fog).near = isArena ? ARENA_FOG_NEAR : biome.fogNear;
  (scene.fog as THREE.Fog).far = isArena ? Math.max(ARENA_FOG_FAR_MIN, biome.fogFar) : biome.fogFar;
}
// nearest plain floor tile to the room centre (the centre itself can be cover or a ramp)
export function roomSpot(r: Room): [number, number] {
  const cx = Math.floor(r.x + r.w / 2),
    cy = Math.floor(r.y + r.h / 2);
  let best: [number, number] | null = null,
    bd = Infinity;
  for (let j = r.y; j < r.y + r.h; j++)
    for (let i = r.x; i < r.x + r.w; i++) {
      const k = j * W + i;
      if (!walkable(k) || level.hazardTiles[k]) continue;
      const d = (i - cx) * (i - cx) + (j - cy) * (j - cy);
      if (d < bd) {
        bd = d;
        best = [(i + 0.5) * T, (j + 0.5) * T];
      }
    }
  return best || [(cx + 0.5) * T, (cy + 0.5) * T];
}
export function randomTileIn(r: Room): [number, number] {
  for (let k = 0; k < SPOT_TRIES; k++) {
    const i = randi(r.x, r.x + r.w - 1),
      j = randi(r.y, r.y + r.h - 1);
    const k = j * W + i;
    if (walkable(k) && !level.hazardTiles[k])
      return [(i + 0.5) * T + rand(-SPOT_JITTER, SPOT_JITTER), (j + 0.5) * T + rand(-SPOT_JITTER, SPOT_JITTER)];
  }
  return roomSpot(r);
}
export function reveal(ti: number, tj: number) {
  if (level.arena) {
    level.seen.fill(1);
    return;
  }
  for (let dj = -REVEAL_BOX; dj <= REVEAL_BOX; dj++)
    for (let di = -REVEAL_BOX; di <= REVEAL_BOX; di++) {
      if (di * di + dj * dj > REVEAL_R2) continue;
      const i = ti + di,
        j = tj + dj;
      if (i >= 0 && j >= 0 && i < W && j < H) level.seen[j * W + i] = 1;
    }
  const r = level.roomOf[tj * W + ti];
  if (r >= 0) {
    const R = level.rooms[r];
    for (let j = R.y - 1; j <= R.y + R.h; j++)
      for (let i = R.x - 1; i <= R.x + R.w; i++) if (i >= 0 && j >= 0 && i < W && j < H) level.seen[j * W + i] = 1;
  }
}
