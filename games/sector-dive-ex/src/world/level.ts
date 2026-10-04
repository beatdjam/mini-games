import * as THREE from 'three';
import { createRng, rand, randi } from '@engine/core/util.ts';
import { clearWorld } from '@engine/core/world.ts';
import { disposeTree, scene } from '@engine/render/render.ts';
import { clearFx } from '@engine/render/fx.ts';
import {
  H,
  T,
  W,
  computeFlow,
  flow,
  inBounds,
  setTileWorld,
  tileCenter,
  tileCoord,
  tileIndex,
  walkable,
} from '@engine/world/tiles.ts';
import { tileMapFromRows } from '@engine/world/tilemap.ts';
import { clearPool } from '@engine/world/projectiles.ts';
import { BIOMES } from '../data/biomes.ts';
import { COLOR } from '../data/colors.ts';
import type { Biome } from '../data/types.ts';
import { eBullets, enemies, pBullets, removeEnemyMesh, setBoss, setNear } from './entities.ts';
import { clearHazards } from './hazards.ts';
import { ARENA_FROM, generateLevel } from './levelGen.ts';
import type { FloorPlan } from './building.ts';
import { FLOOR_H } from './building.ts';
import type { Building } from './building.ts';
import { buildDoorMeshes, resetDoorMeshes, useDoorFloor } from './doors.ts';
import type { GeneratedLevel, Room } from './levelGen.ts';
import { buildFloorMeshes, buildLevelMeshes } from './levelMesh.ts';
import type { Portal } from './portals.ts';
// ---- tuning numbers used only here (the per-sector numbers are in data/biomes.ts gen) ----
const ARENA_FOG_NEAR = 6; // fog start in boss arenas (m)
const ARENA_FOG_FAR_MIN = 50; // fog end in boss arenas is at least this (m)
const SPOT_JITTER = 1; // random spots in a room scatter this far from the tile centre (m)
const SPOT_TRIES = 40; // attempts to find a free random spot
const REVEAL_R2 = 18; // map reveal radius around the player, squared (tiles)
const REVEAL_BOX = 4; // ... searched in this many tiles each way
// the level being played: built as a whole by buildLevel, replaced (never patched field by field) on the next one
interface Level {
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
  floor: number; // a floor of the building (0 = top), or -1 for a level on its own (boss practice, tests)
  hall: { room: number; door: number } | null; // the boss room of a building floor and its door's tile
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
    floor: -1,
    hall: null,
  };
}
// replaced only by buildLevel and buildFixedLevel (and emptied piecewise by clearLevel)
export let level: Level = emptyLevel();

// the building on screen: every floor's meshes, stacked (see showBuilding). The level's group is one of floorGroups then
let buildingGroup: THREE.Group | null = null;
let floorGroups: THREE.Group[] = [];
let shown: Building | null = null;
// the lifts' platforms: one per lift, at the level of the floor being played (moved by the ride, flow/events.ts)
export let liftPads: { link: number; mesh: THREE.Mesh }[] = [];
export const buildingShown = (b: Building | null): boolean => !!b && shown === b;

function clearLevel() {
  if (buildingGroup) {
    disposeTree(buildingGroup);
    scene.remove(buildingGroup);
    buildingGroup = null;
    floorGroups = [];
    liftPads = [];
    shown = null;
    resetDoorMeshes();
    level.group = null;
  } else if (level.group) {
    disposeTree(level.group);
    scene.remove(level.group);
    level.group = null;
  }
  clearHazards();
  clearEntities();
}
// everything that lives on the level being played: enemies, bullets, pickups, effects, gates
function clearEntities() {
  enemies.forEach(removeEnemyMesh);
  clearWorld();
  clearPool(pBullets);
  clearPool(eBullets);
  clearFx();
  level.portals = [];
  setBoss(null);
  setNear(null);
}

// dev only (src/dev/dev.ts, ?seed=): the seed the next built levels use instead of a random one
let forcedSeed: number | null = null;
export function devSeed(seed: number | null) {
  forcedSeed = seed;
}
// a seed for something new to generate: the forced one (dev) or a random one
export const newSeed = (): number => forcedSeed ?? (Math.random() * 2 ** 32) >>> 0;
// the seed makes the generated level (and its signs) reproducible; tests can build a fixed level with it
export function buildLevel(biome: Biome, isArena: boolean, bossKind?: string | null, seed?: number) {
  const useSeed = seed ?? forcedSeed ?? (Math.random() * 2 ** 32) >>> 0;
  useLevel(biome, isArena, generateLevel(biome, isArena, bossKind, createRng(useSeed)), useSeed);
  if (isArena) return;
  // the exit is the room farthest (by walking) from the start
  const [sx, sz] = roomSpot(level.rooms[level.startIdx]);
  computeFlow(tileCoord(sx), tileCoord(sz));
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
// hands one floor's maps to the tile world (new flow buffers each time)
function setFloorWorld(plan: FloorPlan) {
  const { W: w, H: h, maps: M } = plan.gen;
  setTileWorld({
    W: w,
    H: h,
    grid: M.grid,
    hgt: M.hgt,
    ramp: M.ramp,
    cover: M.cover,
    flow: new Int16Array(w * h),
    flowQ: new Int32Array(w * h),
    door: M.door,
    doorOpen: M.doorOpen,
  });
}
const LIFT_PAD = { side: T * 0.92, thick: 0.16 }; // a lift's platform (m)
// Puts the whole building (world/building.ts) on screen: the meshes and doors of every floor, each in a group of its
// own, plus the lifts' platforms. Which floor is played, and where the groups stand, is enterFloor's
export function showBuilding(b: Building) {
  clearLevel();
  const all = new THREE.Group();
  b.plans.forEach((plan, n) => {
    setFloorWorld(plan);
    const g = new THREE.Group();
    buildFloorMeshes(b.biome, plan, g, createRng((b.seed + n) ^ 0x9e3779b9));
    buildDoorMeshes(b.biome, g, plan.hall ? plan.hall.door : -1, n);
    all.add(g);
    floorGroups.push(g);
  });
  const w = b.plans[0]!.gen.W;
  b.links.forEach((l, n) => {
    if (l.kind !== 'elevator') return;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(LIFT_PAD.side, LIFT_PAD.thick, LIFT_PAD.side),
      new THREE.MeshBasicMaterial({ color: COLOR.violet }),
    );
    mesh.position.set(tileCenter(l.a % w), -LIFT_PAD.thick / 2 + 0.02, tileCenter(Math.floor(l.a / w)));
    all.add(mesh);
    liftPads.push({ link: n, mesh });
  });
  scene.add(all);
  buildingGroup = all;
  shown = b;
  (scene.fog as THREE.Fog).color.setHex(b.biome.fog);
  (scene.background as THREE.Color).setHex(b.biome.fog);
}
// Makes floor n of the building on screen the one being played: its maps in the tile world, a new Level for it, and
// the floors placed so that this one stands at height 0 (the ones above it higher, the ones below lower). What lived
// on the floor played before (enemies, bullets, pickups) is gone; the explored map and the meshes stay
export function enterFloor(b: Building, n: number) {
  clearEntities();
  const plan = b.plans[n]!;
  plan.gen.maps.doorOpen?.fill(0);
  setFloorWorld(plan);
  level = {
    biome: b.biome,
    arena: false,
    rooms: plan.gen.rooms,
    roomOf: plan.gen.maps.roomOf,
    seen: plan.seen,
    hazardTiles: plan.gen.hazard,
    roomCount: new Array(plan.gen.rooms.length).fill(0),
    portals: [],
    startIdx: plan.gen.startIdx,
    exitIdx: 0,
    group: floorGroups[n]!,
    seed: b.seed,
    floor: n,
    hall: plan.hall,
  };
  floorGroups.forEach((g, m) => {
    g.position.y = (n - m) * FLOOR_H;
  });
  liftPads.forEach(p => {
    const up = b.links[p.link]!.upper;
    p.mesh.visible = n === up || n === up + 1;
    p.mesh.position.y = -LIFT_PAD.thick / 2 + 0.02;
  });
  useDoorFloor(n);
  (scene.fog as THREE.Fog).near = b.biome.fogNear;
  (scene.fog as THREE.Fog).far = b.biome.fogFar;
}
// where the boss fights: the middle of the boss room on a building floor, the middle of the map in a boss arena;
// and how many tiles the arena's own coordinates (data/bosses.ts) are shifted by
export function arenaCenter(): [number, number] {
  if (!level.hall) return [(W * T) / 2, (H * T) / 2];
  const r = level.rooms[level.hall.room]!;
  return [(r.x + r.w / 2) * T, (r.y + r.h / 2) * T];
}
export function arenaShift(): [number, number] {
  if (!level.hall) return [0, 0];
  const r = level.rooms[level.hall.room]!;
  return [r.x - ARENA_FROM, r.y - ARENA_FROM];
}
// the fog of a boss arena, for the boss room of a building floor once the fight starts
export function arenaFog() {
  (scene.fog as THREE.Fog).near = ARENA_FOG_NEAR;
  (scene.fog as THREE.Fog).far = Math.max(ARENA_FOG_FAR_MIN, level.biome.fogFar);
}
// a hand-drawn level (a map written as rows of text, engine/src/world/tilemap.ts) instead of a generated one: the same
// tile world, meshes and Level, with the start and exit rooms given. For tests that need a known terrain.
interface FixedMap {
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
    door: M.door,
    doorOpen: M.doorOpen,
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
    floor: -1,
    hall: null,
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
        best = [tileCenter(i), tileCenter(j)];
      }
    }
  return best || [tileCenter(cx), tileCenter(cy)];
}
export function randomTileIn(r: Room): [number, number] {
  for (let k = 0; k < SPOT_TRIES; k++) {
    const i = randi(r.x, r.x + r.w - 1),
      j = randi(r.y, r.y + r.h - 1);
    const tile = j * W + i;
    if (walkable(tile) && !level.hazardTiles[tile])
      return [tileCenter(i) + rand(-SPOT_JITTER, SPOT_JITTER), tileCenter(j) + rand(-SPOT_JITTER, SPOT_JITTER)];
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
      if (inBounds(i, j)) level.seen[j * W + i] = 1;
    }
  const r = level.roomOf[tj * W + ti];
  if (r >= 0) {
    const R = level.rooms[r];
    for (let j = R.y - 1; j <= R.y + R.h; j++)
      for (let i = R.x - 1; i <= R.x + R.w; i++) if (inBounds(i, j)) level.seen[j * W + i] = 1;
  }
}
