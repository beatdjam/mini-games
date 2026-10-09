import * as THREE from 'three';
import { createRng, rand, randi } from '@engine/core/util.ts';
import { clearWorld, groupOf, spawn, sweepWorld } from '@engine/core/world.ts';
import { disposeTree, dynGroup, scene } from '@engine/render/render.ts';
import { clearFx } from '@engine/render/fx.ts';
import {
  H,
  T,
  W,
  computeFlow,
  floorY,
  flow,
  hasLOS,
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
import type { Biome, Enemy, Pickup, RegularEnemy } from '../data/types.ts';
import { eBullets, enemies, pBullets, removeEnemyMesh, setBoss, setNear, setTarget } from './entities.ts';
import { clearHazards } from './hazards.ts';
import { ARENA_FROM, generateLevel } from './levelGen.ts';
import type { FloorPlan } from './building.ts';
import { FLOOR_H } from './building.ts';
import type { Building } from './building.ts';
import { buildDoorMeshes, resetDoorMeshes, useDoorFloor } from './doors.ts';
import { lookOf } from './looks.ts';
import { liftPaint } from './looks/common.ts';
import { paint } from './looks/paint.ts';
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
let hallTop: THREE.Group | null = null; // the part of the boss room above WALL_H (levelMesh.ts buildFloorMeshes)
export let liftPads: { link: number; mesh: THREE.Mesh }[] = [];
export const buildingShown = (b: Building | null): boolean => !!b && shown === b;
// What was left on the floors of the building on screen when the player went on to another floor: the enemies still
// alive, the pickups still lying there, the enemies left per room. A floor the player comes back to gets them back
// as they were. In memory only: a resumed run rebuilds the floors from what the checkpoint says (the cleared rooms)
interface FloorStash {
  enemies: Enemy[];
  pickups: Pickup[];
  roomCount: number[];
}
const floorStash = new Map<number, FloorStash>();
// Takes the living enemies and the pickups of the floor being played out of the world (out of the scene too) and keeps
// them for the floor. Call before enterFloor moves on
export function stashFloor() {
  if (level.floor < 0 || !shown) return;
  sweepWorld();
  const kept = enemies.filter(e => !e.boss),
    others = groupOf('pickup').list,
    pickups = others.filter(o => o.tag === 'pickup') as Pickup[];
  enemies.filter(e => e.boss).forEach(removeEnemyMesh);
  enemies.length = 0;
  let n = 0;
  for (const o of others) if (o.tag !== 'pickup') others[n++] = o;
  others.length = n;
  for (const e of kept) {
    dynGroup.remove(e.mesh);
    if (e.laser) dynGroup.remove(e.laser);
  }
  for (const p of pickups) dynGroup.remove(p.mesh);
  setTarget(null);
  setNear(null);
  floorStash.set(level.floor, { enemies: kept, pickups, roomCount: level.roomCount.slice() });
}
// Puts back what stashFloor kept for the floor being played. False when there is nothing kept (a first visit, or a
// floor rebuilt after a resume): the caller populates the floor then
export function restoreFloor(): boolean {
  const s = floorStash.get(level.floor);
  if (!s) return false;
  floorStash.delete(level.floor);
  for (const e of s.enemies) {
    dynGroup.add(e.mesh);
    if (e.laser) dynGroup.add(e.laser);
    spawn(e);
  }
  for (const p of s.pickups) {
    dynGroup.add(p.mesh);
    spawn(p);
  }
  level.roomCount = s.roomCount;
  return true;
}
// the enemies-left-per-room counts kept for a floor that is not being played (undefined when nothing is kept)
export const stashedRoomCount = (floor: number): number[] | undefined => floorStash.get(floor)?.roomCount;

// ---- enemies that follow the player up or down a stairwell ----
// When the player crosses to another floor by a stairwell, the awake enemies close behind are not left on the floor:
// each comes out on the new floor, at the tile the player crossed on, after the time it needs to walk there. (Only
// the floor being played is simulated, so on the way they are off the field: not drawn, not hit.) They keep their own
// strength and still count for their own room. An enemy that stands still, a boss, and anything far away stay behind.
const FOLLOW_TILES = 10; // followers are at most this many tiles of walking from the player when they cross
const FOLLOW_GAP = 0.6; // seconds between two followers coming out, so that they do not come out on top of each other
interface Follower {
  e: Enemy;
  from: number; // the floor it left (it goes back there if the player moves on before it arrives)
  t: number; // seconds until it comes out
  tile: number; // where it comes out
}
let followers: Follower[] = [];
// Call right after stashFloor, with the tile the player crossed on and the flow distances of the floor just left
// (tiles of walking to the player, by tile; negative = no way): takes the followers out of what was kept
export function takeFollowers(from: number, tile: number, dist: (e: Enemy) => number) {
  const s = floorStash.get(from);
  if (!s) return;
  const going: Follower[] = [];
  s.enemies = s.enemies.filter(e => {
    const d = dist(e),
      speed = e.boss ? 0 : e.def.speed;
    if (!e.active || e.dead || speed <= 0 || d < 0 || d > FOLLOW_TILES) return true;
    going.push({ e, from, t: (d * T) / speed, tile });
    return false;
  });
  // nearest first, and never two at once
  going.sort((a, b) => a.t - b.t);
  going.forEach((f, n) => {
    f.t = Math.max(f.t, (going[n - 1]?.t ?? -FOLLOW_GAP) + FOLLOW_GAP);
  });
  followers.push(...going);
}
// The player is leaving the floor the followers were coming to: those still on the way go back to the floor they
// left (kept there like the rest of its enemies). Call before stashFloor
export function recallFollowers() {
  for (const f of followers) floorStash.get(f.from)?.enemies.push(f.e);
  followers = [];
}
// every frame on a building floor: the followers whose time has come walk out onto this floor
export function updateFollowers(dt: number) {
  if (!followers.length) return;
  const left: Follower[] = [];
  for (const f of followers) {
    f.t -= dt;
    if (f.t > 0) {
      left.push(f);
      continue;
    }
    const e = f.e as RegularEnemy;
    e.x = tileCenter(f.tile % W);
    e.z = tileCenter(Math.floor(f.tile / W));
    e.fy = floorY(e.x, e.z);
    e.mesh.position.set(e.x, e.fy + e.y, e.z);
    dynGroup.add(e.mesh);
    if (e.laser) dynGroup.add(e.laser);
    spawn(e);
  }
  followers = left;
}
export const followersOnTheWay = (): number => followers.length; // tests

// the building is gone: so is everything kept for its floors
function dropFloorStash() {
  followers.forEach(f => removeEnemyMesh(f.e));
  followers = [];
  floorStash.forEach(s => {
    s.enemies.forEach(removeEnemyMesh);
    s.pickups.forEach(p => disposeTree(p.mesh));
  });
  floorStash.clear();
}

function clearLevel() {
  if (buildingGroup) {
    disposeTree(buildingGroup);
    scene.remove(buildingGroup);
    buildingGroup = null;
    floorGroups = [];
    liftPads = [];
    hallTop = null;
    shown = null;
    dropFloorStash();
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
const LIFT_SIDE = 0x2b2f34; // the platform's edge under its picture
const LIFT_SEED = 77; // the picture's seed (the same platform every time)
let liftTop: THREE.CanvasTexture | null = null; // the picture on a lift's platform, made once
const HALL_NEAR = 14; // this close to the boss room's door counts as at the boss room (m)
const NEIGHBOUR_SHOW_R = 40; // the floors above and below are drawn within this of a stairwell or lift, or the fog's end if nearer (m)
// Draws the other floors only while the player is near a stairwell or lift of this floor: the floors it leads to and
// passes (that is the only place they can be seen from). The rest of the time only this floor is drawn. Called every
// frame on a building floor
export function showNeighbourFloors(b: Building, x: number, z: number) {
  const n = level.floor,
    w = b.plans[0]!.gen.W,
    reach = Math.min(NEIGHBOUR_SHOW_R, b.biome.fogFar),
    // a link of this floor that the player is near: the floors it joins and passes are seen along it
    near = (m: number) =>
      b.links.some(
        l =>
          (l.upper === n || l.lower === n) &&
          m >= l.upper &&
          m <= l.lower &&
          l.strip.some(k => Math.hypot(tileCenter(k % w) - x, tileCenter(Math.floor(k / w)) - z) < reach),
      ) ||
      // ... and the floors the courtyard is open through, near it
      (!!b.court &&
        n >= b.court.upper &&
        n <= b.court.lower &&
        m >= b.court.upper &&
        m <= b.court.lower &&
        b.court.tiles.some(k => Math.hypot(tileCenter(k % w) - x, tileCenter(Math.floor(k / w)) - z) < reach));
  // In the boss room, and in front of its door, only this floor is drawn: the room is higher than a floor (HALL_H),
  // so its top stands where the floor above is, and the two must not show together
  const hall = level.hall,
    atHall =
      !!hall &&
      (level.roomOf[tileIndex(x, z)] === hall.room ||
        Math.hypot(tileCenter(hall.door % w) - x, tileCenter(Math.floor(hall.door / w)) - z) < HALL_NEAR);
  floorGroups.forEach((g, m) => {
    g.visible = m === n || (!atHall && near(m));
  });
  // the top of the boss room shows while its floor is the one played (from another floor it would stand in the way)
  if (hallTop) hallTop.visible = !!hall;
}
export const floorDrawn = (m: number): boolean => !!floorGroups[m]?.visible;
// Puts the whole building (world/building.ts) on screen: the meshes and doors of every floor, each in a group of its
// own, plus the lifts' platforms. Which floor is played, and where the groups stand, is enterFloor's
export function showBuilding(b: Building) {
  clearLevel();
  const all = new THREE.Group();
  b.plans.forEach((plan, n) => {
    setFloorWorld(plan);
    const g = new THREE.Group();
    const top = buildFloorMeshes(b.biome, plan, g, createRng((b.seed + n) ^ 0x9e3779b9));
    if (top) hallTop = top;
    buildDoorMeshes(b.biome, g, plan.hall ? plan.hall.door : -1, n);
    all.add(g);
    floorGroups.push(g);
  });
  const w = b.plans[0]!.gen.W,
    look = lookOf(b.biome);
  b.links.forEach((l, n) => {
    if (l.kind !== 'elevator') return;
    // a sector with a look has the platform's picture on top (the same in every sector); else it is plain violet
    const side = new THREE.MeshBasicMaterial({ color: look ? LIFT_SIDE : COLOR.violet }),
      top = look ? new THREE.MeshBasicMaterial({ map: (liftTop ??= paint(LIFT_SEED, liftPaint)) }) : side,
      mesh = new THREE.Mesh(new THREE.BoxGeometry(LIFT_PAD.side, LIFT_PAD.thick, LIFT_PAD.side), [
        side,
        side,
        top,
        side,
        side,
        side,
      ]);
    mesh.position.set(tileCenter(l.a % w), -LIFT_PAD.thick / 2 + 0.02, tileCenter(Math.floor(l.a / w)));
    all.add(mesh);
    liftPads.push({ link: n, mesh });
  });
  scene.add(all);
  buildingGroup = all;
  shown = b;
  // a sector with its own look fades to that look's colour
  const fog = lookOf(b.biome)?.fog ?? b.biome.fog;
  (scene.fog as THREE.Fog).color.setHex(fog);
  (scene.background as THREE.Color).setHex(fog);
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
    const l = b.links[p.link]!;
    p.mesh.visible = n === l.upper || n === l.lower;
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
  const show = (i: number, j: number) => {
    if (inBounds(i, j)) level.seen[j * W + i] = 1;
  };
  // the circle round the player opens only where there is a clear line from the tile stood on: nothing on the far
  // side of a wall (a stairwell next door, the room behind a locked door) is given away before it is found
  const inSight = (i: number, j: number): boolean =>
    hasLOS(tileCenter(ti), tileCenter(tj), tileCenter(i), tileCenter(j));
  for (let dj = -REVEAL_BOX; dj <= REVEAL_BOX; dj++)
    for (let di = -REVEAL_BOX; di <= REVEAL_BOX; di++) {
      if (di * di + dj * dj > REVEAL_R2) continue;
      if (inBounds(ti + di, tj + dj) && inSight(ti + di, tj + dj)) show(ti + di, tj + dj);
    }
  const r = level.roomOf[tj * W + ti];
  if (r >= 0) {
    const R = level.rooms[r];
    for (let j = R.y - 1; j <= R.y + R.h; j++) for (let i = R.x - 1; i <= R.x + R.w; i++) show(i, j);
  }
}
