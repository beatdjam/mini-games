import * as THREE from 'three';
import { createRng, rand, randi, wrapAngle, yawToward } from '@engine/core/index.ts';
import { clearWorld, groupOf, spawn, sweepWorld } from '@engine/core/index.ts';
import { camera, disposeTree, dynGroup, scene } from '@engine/render/index.ts';
import { clearFx } from '@engine/render/index.ts';
import {
  H,
  T,
  W,
  activeTileGrid,
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
} from '@engine/world/index.ts';
import { tileMapFromRows } from '@engine/world/index.ts';
import { clearPool } from '@engine/world/index.ts';
import { BIOMES } from '../data/biomes.ts';
import { COLOR } from '../data/colors.ts';
import type { Biome, BossKind, Enemy, Pickup, RegularEnemy } from '../data/types.ts';
import { eBullets, enemies, pBullets, removeEnemyMesh, setBoss, setNear, setTarget } from './entities.ts';
import { clearHazards } from './hazards.ts';
import { ARENA_FROM, generateLevel } from './levelGen.ts';
import type { FloorPlan } from './building.ts';
import { FLOOR_H } from './building.ts';
import { WALL_H } from '../data/level.ts';
import type { Building } from './building.ts';
import { buildDoorMeshes, doorOpenChanges, resetDoorMeshes, useDoorFloor } from './doors.ts';
import { lookOf, wallPic } from './looks.ts';
import { liftPaint } from './looks/common.ts';
import { BACKDROP_GROUND, BACKDROP_R, BACKDROP_TALL, BLOCK_REACH, FACADE_M, ROOF_M, paint } from './looks/paint.ts';
import { buildingShell, massOf, outsideBlocks, outsideStreet, shellOf } from './looks/outside.ts';
import type { GeneratedLevel, Room } from './levelGen.ts';
import { YARD_INTO, buildFloorMeshes, buildLevelMeshes } from './levelMesh.ts';
import { buildAtriumProps, buildYardShell, yardFacades } from './courtMesh.ts';
import {
  buildBackdrop,
  buildOutsideBlocks,
  buildOutsideCards,
  keepOutOfPanes,
  seenThrough,
} from '@engine/render/index.ts';
import { mergeFlat } from '@engine/render/index.ts';
import { chunkInstances, cullChunks } from '@engine/render/index.ts';
import type { Chunk } from '@engine/render/index.ts';
import type { Backdrop, OutsideLook } from '@engine/render/index.ts';
import type { Portal } from './portals.ts';
// ---- tuning numbers used only here (the per-sector numbers are in data/biomes.ts gen) ----
const ARENA_FOG_NEAR = 6; // fog start in boss arenas (m)
const ARENA_FOG_FAR_MIN = 50; // fog end in boss arenas is at least this (m)
const SPOT_JITTER = 1; // random spots in a room scatter this far from the tile centre (m)
const SPOT_TRIES = 40; // attempts to find a free random spot
const REVEAL_R2 = 18; // map reveal radius around the player, squared (tiles)
const REVEAL_BOX = 4; // ... searched in this many tiles each way
const DOOR_SIGHT_CONE = 0.6; // the boss door is looked at when it is within this of the way the player faces (rad)
const DOOR_SIGHT_OUT = T / 2 + 0.5; // the line of sight goes to a point this far out from the door's middle (m)
// ---- the hall of the boss area (buildHall): one square room for now. Its size and the gates' places are stand-ins
// until the hall's shape is decided ----
const HALL_TILES_W = 24; // tiles across
const HALL_TILES_H = 18; // tiles from north to south
const HALL_WALL = '#'.repeat(HALL_TILES_W);
const HALL_FLOOR = '#' + '.'.repeat(HALL_TILES_W - 2) + '#';
const HALL_ROWS = [HALL_WALL, ...Array<string>(HALL_TILES_H - 2).fill(HALL_FLOOR), HALL_WALL];
const HALL_ROOM = { x: 1, y: 1, w: HALL_TILES_W - 2, h: HALL_TILES_H - 2 };
// the gates at the hall's side walls, 8 tiles (32 m) each side of the start spot: TITAN to the west and the way home to
// the east. Kept well away from the middle, so the way home is not stepped on by mistake when going for the terminal
const HALL_SIDE_GAP = 8 * T; // (m)
// the middle pair, one tile (4 m) each side of the start spot: the way on to the west and the terminal to the east,
// side by side where a dive means to go, with the way home out at the wall
const HALL_MID_GAP = T; // (m)
// the gates into the boss rooms, round the start spot: two rows of four, north and south (m from the start spot).
// a stand-in until the hall's shape is decided: sim decides
const HALL_ROOM_GATE_X = [-4.5, -1.5, 1.5, 4.5].map(n => n * T);
const HALL_ROOM_GATE_Z = 5 * T;
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
let floorChunks: Chunk[][] = []; // per floor: its things in chunks (showBuilding), shown by showNeighbourFloors
// per floor: what stands in and round the courtyard (null on a floor it does not pass); drawn from the other floors
// it passes without the rest of the floor
let courtGroups: (THREE.Group | null)[] = [];
// a yard's outer walls, sky, ground and what is on them, or what hangs in an atrium (courtMesh.ts buildYardShell,
// buildAtriumProps)
let yardShell: THREE.Group | null = null;
// The yard as the windows on it show it (levelMesh.ts YARD_INTO): per way they face, a copy of what stands round it on
// every floor, and its walls, sky and ground a tile longer that way (out to the glass), drawn only through those
// windows (engine windows.ts seenThrough). Drawn only while one of those windows of the floor played is in sight (it
// costs as many draws as the yard itself)
const sight = new THREE.Frustum(),
  sightBox = new THREE.Box3(),
  sightM = new THREE.Matrix4();
// The window panes stand PANE_OUT (0.02 m, engine windows.ts) in front of their wall, so a window tile's box is widened
// by this much either way in x and z: a pane at the very edge of the view then still counts as seen (m)
const WINDOW_BOX_GROW = 0.05;
let yardCopies: {
  into: number;
  root: THREE.Group;
  // what the copy stands with (it takes its place), the copy, and its floor (-1: the yard's walls)
  parts: [THREE.Object3D, THREE.Object3D, number][];
  way: [number, number]; // the way the windows face (from their wall toward the floor)
}[] = [];
// through a window on a yard, the things of the floors (balconies, rails, bridges) are drawn this many floors above and
// below the one played and no further: across the yard (5 to 7 tiles) the window shows about that much of its height
const YARD_COPY_FLOORS = 2;
const YARD_NEAR = 1.5 * T; // the yard is drawn within this of a tile out on it, wherever one looks (m)
// what the windows look out on (Look.outside): the backdrop, the building's own outside walls and the buildings across
// the street. They stand on the street, the ground of the lowest floor (moved with the floors: enterFloor)
let outside: { band: Backdrop; across: THREE.Group } | null = null;
// through a window on a yard, nothing that stands in the yard is drawn this near the wall the window is in (m)
const YARD_GLASS_CLEAR = 0.5;
// ... but its walls, sky and ground are, up to this near the glass (m): they are drawn a tile longer, out to the glass
// (their picture and lit panes stand up to 0.1 m in front of the walls: courtMesh.ts YARD_SKIN), so the walls that
// run away from the glass reach it
const YARD_WALL_CLEAR = 0.15;
const OUTSIDE_SEED = 0x51ab; // mixed into the building's seed for the buildings across the street
const SHELL_STOREYS = 2; // the facade's picture (4 storeys) over this many floors of the building's own walls: two storeys a floor, so its windows keep their shape
let shown: Building | null = null;
// Per mesh of a floor: the rooms its copies (InstancedMesh) or vertices (Mesh) stand in, whether all of them are in a
// room (roomOf >= 0: a mesh that also stands over a wall or a corridor is never hidden), and whether it was drawn when
// it was marked. Kept in userData.roomCull; showNeighbourFloors hides a mesh only when every room it stands in is out
// of the player's reach (through open doors).
interface RoomCull {
  rooms: number[]; // room numbers of the copies (vertices), without repetitions
  allInside: boolean; // every copy (vertex) is in a room (roomOf >= 0)
  shown: boolean; // the mesh's own visibility when it was marked
}
const ROOM_CULL = 'roomCull';
// What the rooms the player can reach were last worked out for: the building, the floor, the player's tile and how many
// doors have started or stopped moving. Worked out again only when one of them changes (showNeighbourFloors).
interface ReachState {
  building: Building;
  floor: number;
  tile: number;
  opened: number;
  hidden: Uint8Array; // per room: 1 = out of reach and not facing a courtyard, a stairwell or a lift
}
let reachState: ReachState | null = null;
// What showNeighbourFloors last ran with: the building, the floor played (and its group), the lift ridden, the player's
// place, the camera's place and projection, how many door tiles have changed between passable and shut, and how many
// have started or stopped moving. It runs again only when one of them changes: a shut door is a wall for the way to
// the yard (seesYard/hasLOS/isShutDoor) and for the rooms seen from here, and the awake enemies and bosses open doors
// too. The two matrices are copied into these, so no array is made per frame.
interface NeighbourInputs {
  building: Building;
  floor: number;
  group: THREE.Group | null;
  riding: number | null;
  x: number;
  z: number;
  doors: number;
  opened: number;
  world: Float64Array;
  projection: Float64Array;
}
let neighbourInputs: NeighbourInputs | null = null;
// the lifts' platforms: one per lift, at the level of the floor being played (moved by the ride, flow/events.ts)
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
  clearWorld('shell'); // a round in the air would land on the next floor
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
// the enemies kept for the floors not being played (some may have followed the player there from another floor)
export const stashedEnemies = (): Enemy[] => [...floorStash.values()].flatMap(s => s.enemies);

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
// The player has left the floor `from`: the enemies kept there that belong to another floor (they followed the player
// to `from` and were left there) go back to their own room, asleep, as if they had walked home. Left where they were,
// their room would stay empty and never count as cleared until the player came back for them. Call after
// takeFollowers (the ones close behind the player come along instead)
export function sendStragglersHome(b: Building, from: number) {
  const s = floorStash.get(from);
  if (!s) return;
  s.enemies = s.enemies.filter(e => {
    const home = e.floor === undefined || e.floor === from ? undefined : floorStash.get(e.floor);
    if (!home || e.boss || e.dead || e.room < 0) return true;
    const { W: w, maps, rooms } = b.plans[e.floor!]!.gen,
      r = rooms[e.room]!,
      free: number[] = [];
    for (let j = r.y; j < r.y + r.h; j++)
      for (let i = r.x; i < r.x + r.w; i++) {
        const k = j * w + i;
        if (maps.grid[k] === 1 && !maps.cover[k] && maps.ramp[k]! < 0) free.push(k);
      }
    if (!free.length) return true;
    const k = free[randi(0, free.length - 1)]!;
    e.x = tileCenter(k % w);
    e.z = tileCenter(Math.floor(k / w));
    e.fy = maps.hgt[k]!;
    e.mesh.position.set(e.x, e.fy + e.y, e.z);
    e.active = false;
    home.enemies.push(e);
    return false;
  });
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
  neighbourInputs = null;
  reachState = null;
  if (buildingGroup) {
    disposeTree(buildingGroup);
    scene.remove(buildingGroup);
    buildingGroup = null;
    floorGroups = [];
    floorChunks = [];
    courtGroups = [];
    yardCopies = [];
    yardShell = null;
    outside = null;
    liftPads = [];
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
export function buildLevel(biome: Biome, isArena: boolean, bossKind?: BossKind | null, seed?: number) {
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
const NEIGHBOUR_SHOW_R = 40; // the floors above and below are drawn within this of a stairwell or lift, or the fog's end if nearer (m)
const CHUNK_M = 8 * T; // side of a chunk of a floor's things (m): only the chunks in view and short of the fog are drawn
const CHUNK_MIN_TRIS = 3000; // only a kind of thing with this many triangles in all on a floor is cut into chunks
const STAIR_SEEN_R = 16; // of another floor seen down or up a stairwell, only the chunks this near the stairwell (m)
// of floor m seen from floor n down or up their stairwells: whether a chunk (its box, in the world) stands near one
function stairsSeen(b: Building, n: number, m: number): (box: THREE.Box3) => boolean {
  const w = b.plans[0]!.gen.W,
    at = new THREE.Vector3(),
    spots = b.links
      .filter(l => l.kind === 'stairs' && (l.upper === n || l.lower === n) && m >= l.upper && m <= l.lower)
      .flatMap(l => l.strip.map(k => [tileCenter(k % w), tileCenter(Math.floor(k / w))] as const));
  return box => spots.some(([x, z]) => box.distanceToPoint(at.set(x, box.min.y, z)) < STAIR_SEEN_R);
}
// Draws the other floors only while the player is near a stairwell of this floor (the floors it leads to: that is the
// only place they can be seen from) or rides a lift (`riding`: its link; the floors it joins and passes). Standing by a
// lift shows nothing of the other floors: its shaft is walled in. The rest of the time only this floor is drawn. Called
// every frame on a building floor
// is a yard seen from (x, z) on floor n: one of the floor's tiles out on it (balcony, bridge, ground) within
// YARD_NEAR, or in sight (not through a wall)
function seesYard(b: Building, n: number, x: number, z: number): boolean {
  const cf = b.plans[n]?.court,
    w = b.plans[0]!.gen.W;
  if (!cf) return false;
  const out = [...cf.balcony, ...cf.bridge, ...(cf.ground ? cf.tiles : [])];
  return out.some(k => {
    const tx = tileCenter(k % w),
      tz = tileCenter(Math.floor(k / w));
    return Math.hypot(tx - x, tz - z) < YARD_NEAR || hasLOS(x, z, tx, tz);
  });
}
// Works out the rooms of floor n that the player cannot reach from (x, z) through floor tiles and doors that have
// started to open (doorOpen > 0: the leaves part before DOOR_PASS). Rooms with a courtyard tile, a stairwell or lift
// strip, or a gap to another floor (voids, noFloor, noCeil, shaft) at or next to one of their tiles are never hidden:
// they can be seen from there. Anything not known is left out of the hidden set, so it stays drawn.
function hiddenRoomsFrom(b: Building, n: number, x: number, z: number): Uint8Array {
  const plan = b.plans[n]!,
    { W: w, H: h, maps } = plan.gen,
    { grid, door, doorOpen } = activeTileGrid().world,
    roomOf = maps.roomOf,
    size = w * h,
    seen = new Uint8Array(size),
    queue = new Int32Array(size),
    start = tileIndex(x, z);
  let head = 0,
    tail = 0;
  // (a player not on a floor tile has no reach to work out from: nothing is hidden)
  if (!(start >= 0 && start < size && grid[start] === 1)) return new Uint8Array(plan.gen.rooms.length);
  seen[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const k = queue[head++]!,
      i = k % w,
      j = (k / w) | 0;
    for (const o of [1, -1, w, -w]) {
      const ni = i + (o === 1 ? 1 : o === -1 ? -1 : 0),
        nj = j + (o === w ? 1 : o === -w ? -1 : 0);
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const t = nj * w + ni;
      if (seen[t] || grid[t] !== 1) continue;
      // a door that has not started to open is a wall
      if (door && door[t] === 1 && !(doorOpen && doorOpen[t]! > 0)) continue;
      seen[t] = 1;
      queue[tail++] = t;
    }
  }
  const rooms = plan.gen.rooms.length,
    reach = new Uint8Array(rooms);
  for (let k = 0; k < size; k++) {
    const r = seen[k] ? roomOf[k]! : -1;
    if (r >= 0) reach[r] = 1;
  }
  // rooms at or next to a place seen from outside their own room: a courtyard, a gap to another floor, a stairwell or
  // lift. (A wall between the tile and the room is taken as facing it too: it can have a window on it.)
  const open = new Uint8Array(rooms),
    mark = (k: number) => {
      const i = k % w,
        j = (k / w) | 0;
      for (const [di, dj] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const a = i + di!,
          b = j + dj!;
        if (a < 0 || b < 0 || a >= w || b >= h) continue;
        const r = roomOf[b * w + a]!;
        if (r >= 0) open[r] = 1;
      }
    };
  if (plan.court) for (const k of [...plan.court.tiles, ...plan.court.balcony, ...plan.court.bridge]) mark(k);
  for (const gaps of [plan.voids, plan.noFloor, plan.noCeil, plan.shaft]) gaps.forEach((v, k) => v && mark(k));
  // (only the stairwells and lifts that stop on or pass this floor: another floor's has no opening here)
  for (const l of b.links) if (n >= l.upper && n <= l.lower) for (const k of l.strip) mark(k);
  const hidden = new Uint8Array(rooms);
  for (let r = 0; r < rooms; r++) hidden[r] = !reach[r] && !open[r] ? 1 : 0;
  return hidden;
}
// the rooms to hide for the floor being played, worked out again only when the player's tile or a door's movement
function hiddenRooms(b: Building, x: number, z: number): Uint8Array {
  const tile = tileIndex(x, z),
    opened = doorOpenChanges(),
    was = reachState;
  if (was && was.building === b && was.floor === level.floor && was.tile === tile && was.opened === opened)
    return was.hidden;
  const hidden = hiddenRoomsFrom(b, level.floor, x, z);
  reachState = { building: b, floor: level.floor, tile, opened, hidden };
  return hidden;
}
// Hides the played floor's meshes that stand only in rooms out of the player's reach. A mesh over a wall, a corridor or
// a reachable room stays drawn; the chunks' own visibility is left as cullChunks set it.
function showFloorRooms(group: THREE.Group, hidden: Uint8Array) {
  group.traverse(o => {
    const mesh = o as THREE.Mesh,
      // (userData is untyped in three.js: this is the one place its room mark is cast to its shape)
      mark = mesh.userData[ROOM_CULL] as RoomCull | undefined;
    if (!mesh.isMesh || !mark) return;
    mesh.visible = mark.shown && !(mark.allInside && mark.rooms.length > 0 && mark.rooms.every(r => hidden[r]));
  });
}
export function showNeighbourFloors(b: Building, x: number, z: number, riding: number | null) {
  camera.updateMatrixWorld();
  sight.setFromProjectionMatrix(sightM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const n = level.floor,
    w = b.plans[0]!.gen.W,
    reach = Math.min(NEIGHBOUR_SHOW_R, b.biome.fogFar),
    // a link of this floor that the player is near: the floors it joins and passes are seen along it
    near = (m: number) =>
      b.links.some(
        (l, k) =>
          (l.kind === 'stairs' || k === riding) &&
          (l.upper === n || l.lower === n) &&
          m >= l.upper &&
          m <= l.lower &&
          l.strip.some(k => Math.hypot(tileCenter(k % w) - x, tileCenter(Math.floor(k / w)) - z) < reach),
      ),
    // near the courtyard, on a floor it passes: its galleries on the other floors are seen across it (not the rest
    // of those floors)
    c = b.court,
    atCourt =
      !!c &&
      n >= c.upper &&
      n <= c.lower &&
      c.tiles.some(k => Math.hypot(tileCenter(k % w) - x, tileCenter(Math.floor(k / w)) - z) < reach),
    // ... and the yard itself is seen from here: one of this floor's tiles out on it (a balcony, a bridge, the ground)
    // is right by or in sight. From a room the yard's walls stand in the way (it is seen through the windows on it,
    // their own copies of it), and drawn there it would be all of it, behind the walls
    yardSeen = atCourt && seesYard(b, n, x, z);
  floorGroups.forEach((g, m) => {
    g.visible = m === n || near(m);
    const cg = courtGroups[m];
    if (cg) cg.visible = g.visible || (b.court?.open ? yardSeen : atCourt);
    if (!g.visible || !floorChunks[m]) return;
    // in view and short of the fog; of another floor seen along a stairwell, only round the stairwell (riding a lift,
    // the whole of the floors it passes)
    const by = m === n || riding !== null ? undefined : stairsSeen(b, n, m);
    cullChunks(floorChunks[m]!, g, camera, b.biome.fogFar, by);
    // the rooms not in the player's reach: only the floor being played (the floors a stairwell or lift shows are seen
    // from outside them and keep their own rule)
    if (m === n) showFloorRooms(g, hiddenRooms(b, x, z));
  });
  // What the windows look out on is drawn only while one of them is in sight (it costs many draws): a window of a
  // floor in sight counts, from anywhere (a stairwell sees the windows of the floors it passes)
  if (outside) {
    let seen = false;
    for (const g of floorGroups) {
      if (seen || !g.visible) continue;
      const tiles = g.userData.outsideWindows as [number, number][] | undefined;
      if (!tiles) continue;
      for (const [i, j] of tiles) {
        sightBox.min.set(
          tileCenter(i) - T / 2 - WINDOW_BOX_GROW,
          g.position.y,
          tileCenter(j) - T / 2 - WINDOW_BOX_GROW,
        );
        sightBox.max.set(
          tileCenter(i) + T / 2 + WINDOW_BOX_GROW,
          g.position.y + WALL_H,
          tileCenter(j) + T / 2 + WINDOW_BOX_GROW,
        );
        if (sight.intersectsBox(sightBox)) {
          seen = true;
          break;
        }
      }
    }
    outside.band.visible = seen;
    outside.across.visible = seen;
  }
  if (yardShell) yardShell.visible = !!b.court?.open ? yardSeen : atCourt;
  if (yardCopies.length) {
    const panes = floorGroups[n]!.userData.yardPanes as Record<number, [number, number, number, number]> | undefined;
    for (const y of yardCopies) {
      const at = panes?.[y.into],
        // (the panes are seen only from the floor's side of their wall, the way `way` goes: from the yard and its
        // balconies, or a room on another side of the yard, they are the back of the wall. Their walls are not all in
        // one line (the end of a balcony or a bridge has one too), so: on the floor's side of any of them, the nearest)
        front =
          !!at &&
          (y.way[0] > 0 ? x > (at[0] + 1) * T : y.way[0] < 0 ? x < at[2] * T : true) &&
          (y.way[1] > 0 ? z > (at[1] + 1) * T : y.way[1] < 0 ? z < at[3] * T : true);
      y.root.visible =
        atCourt &&
        !!at &&
        front &&
        sight.intersectsBox(
          sightBox.set(
            new THREE.Vector3(at[0] * T, 0, at[1] * T),
            new THREE.Vector3((at[2] + 1) * T, WALL_H, (at[3] + 1) * T),
          ),
        );
      if (y.root.visible) for (const [, c, m] of y.parts) c.visible = m < 0 || Math.abs(m - n) <= YARD_COPY_FLOORS;
    }
  }
}
// Calls showNeighbourFloors only when what it looks at has changed: the camera (place and projection: head bob and
// screen shake move it), the player's place, the floor played (its group too), the lift ridden, the building, and the
// doors (passable or not, and started to move or not: a shut door walls off the way to the yard and the rooms behind
// it; awake enemies and bosses open doors too).
export function showNeighbourFloorsIfChanged(
  b: Building,
  x: number,
  z: number,
  riding: number | null,
  doors: number,
  opened: number,
) {
  camera.updateMatrixWorld();
  const was = neighbourInputs,
    same =
      !!was &&
      was.building === b &&
      was.floor === level.floor &&
      was.group === level.group &&
      was.riding === riding &&
      was.x === x &&
      was.z === z &&
      was.doors === doors &&
      was.opened === opened &&
      sameElements(was.world, camera.matrixWorld.elements) &&
      sameElements(was.projection, camera.projectionMatrix.elements);
  if (same) return;
  if (!was) {
    neighbourInputs = {
      building: b,
      floor: level.floor,
      group: level.group,
      riding,
      x,
      z,
      doors,
      opened,
      world: new Float64Array(camera.matrixWorld.elements),
      projection: new Float64Array(camera.projectionMatrix.elements),
    };
  } else {
    was.building = b;
    was.floor = level.floor;
    was.group = level.group;
    was.riding = riding;
    was.x = x;
    was.z = z;
    was.doors = doors;
    was.opened = opened;
    was.world.set(camera.matrixWorld.elements);
    was.projection.set(camera.projectionMatrix.elements);
  }
  showNeighbourFloors(b, x, z, riding);
}
// The matrices are compared element by element. A NaN (a projection with no width or height, say) never matches, so the
// floor is drawn again every frame until it goes: no worse than always drawing it, and the view stays right.
function sameElements(seen: ArrayLike<number>, now: ArrayLike<number>): boolean {
  if (now.length !== seen.length) return false;
  for (let k = 0; k < seen.length; k++) if (seen[k] !== now[k]) return false;
  return true;
}
export const floorDrawn = (m: number): boolean => !!floorGroups[m]?.visible;
// the chunks of floor m (tests: flip one's visibility and see whether anything puts it back)
export const floorChunkRoots = (m: number): THREE.Group[] => floorChunks[m]?.map(c => c.root) ?? [];
// Marks each mesh of a floor with the rooms its copies (InstancedMesh) or vertices (Mesh) stand in, for
// showNeighbourFloors. Done after mergeFlat (which joins InstancedMeshes into Meshes) and before buildDoorMeshes, so a
// door's leaves (plain Meshes, added after) are not marked and are never hidden.
function markMeshRooms(group: THREE.Group, plan: FloorPlan) {
  const { W: w, H: h, maps } = plan.gen,
    roomOf = maps.roomOf,
    p = new THREE.Vector3(),
    roomAt = (x: number, z: number): number => {
      const i = Math.floor(x / T),
        j = Math.floor(z / T);
      return i >= 0 && j >= 0 && i < w && j < h ? roomOf[j * w + i]! : -1;
    };
  group.updateMatrixWorld(true);
  group.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const rooms = new Set<number>();
    let allInside = true,
      any = false;
    const add = (r: number) => {
      any = true;
      if (r < 0) allInside = false;
      else rooms.add(r);
    };
    const im = mesh as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      const a = im.instanceMatrix.array;
      for (let n = 0; n < im.count; n++) {
        p.set(a[n * 16 + 12]!, a[n * 16 + 13]!, a[n * 16 + 14]!).applyMatrix4(mesh.matrixWorld);
        add(roomAt(p.x, p.z));
      }
    } else {
      const at = mesh.geometry.getAttribute('position');
      for (let n = 0; n < at.count; n++) {
        p.fromBufferAttribute(at, n).applyMatrix4(mesh.matrixWorld);
        add(roomAt(p.x, p.z));
      }
    }
    if (any) mesh.userData[ROOM_CULL] = { rooms: [...rooms], allInside, shown: mesh.visible } satisfies RoomCull;
  });
}
// Puts the whole building (world/building.ts) on screen: the meshes and doors of every floor, each in a group of its
// own, plus the lifts' platforms. Which floor is played, and where the groups stand, is enterFloor's
export function showBuilding(b: Building) {
  clearLevel();
  const all = new THREE.Group();
  b.plans.forEach((plan, n) => {
    setFloorWorld(plan);
    const g = new THREE.Group();
    const cg = plan.court ? new THREE.Group() : null;
    buildFloorMeshes(b.biome, plan, g, createRng((b.seed + n) ^ 0x9e3779b9), cg ?? undefined);
    // the floor's things in chunks, so only those in view are drawn (engine/src/render/chunks.ts); then what stands
    // still and is only coloured, drawn as one per chunk (engine/src/render/mergeflat.ts)
    floorChunks.push(chunkInstances(g, CHUNK_M, CHUNK_MIN_TRIS));
    mergeFlat(g);
    if (cg) mergeFlat(cg);
    markMeshRooms(g, plan);
    buildDoorMeshes(b.biome, g, plan.hall ? plan.hall.door : -1, n);
    all.add(g);
    floorGroups.push(g);
    if (cg) all.add(cg);
    courtGroups.push(cg);
  });
  const w = b.plans[0]!.gen.W,
    look = lookOf(b.biome);
  // (a yard's walls agree with the floors' own, in a sector whose rooms have windows on a yard: WallSides yard)
  const yardPicture = (s: number, k: number): number | null => {
    const gen = b.plans[s]?.gen;
    return look?.wallSides?.yard !== undefined && gen && !gen.maps.grid[k]
      ? wallPic(gen, k, { count: look.walls.length, laneWalls: look.laneWalls, sides: look.wallSides })
      : null;
  };
  if (b.court) {
    yardShell = b.court.open
      ? buildYardShell(b.court, w, FLOOR_H, b.biome, yardPicture)
      : buildAtriumProps(b.court, w, FLOOR_H, b.biome);
    // (its walls' things, only coloured, drawn as one: before it is copied into the windows on it)
    mergeFlat(yardShell);
    all.add(yardShell);
  }
  if (b.court?.open && yardShell) {
    const court = b.court,
      shell = yardShell,
      is = court.tiles.map(k => k % w),
      js = court.tiles.map(k => Math.floor(k / w)),
      [i0, i1, j0, j1] = [Math.min(...is), Math.max(...is), Math.min(...js), Math.max(...js)];
    YARD_INTO.forEach(([di, dj], v) => {
      if (!floorGroups.some(g => (g.userData.yardPanes as Record<number, unknown> | undefined)?.[v + 1])) return;
      // The yard's walls, sky and ground a tile longer on the windows' side, out to their glass: the wall the windows
      // are in, a tile thick, is taken as thin as its glass. Only that way: the walls that run away from the glass keep
      // their places, and their windows stand where the rooms behind them have theirs
      const longer = [...court.tiles];
      if (di) for (let j = j0; j <= j1; j++) longer.push(j * w + (di > 0 ? i1 + 1 : i0 - 1));
      else for (let i = i0; i <= i1; i++) longer.push((dj > 0 ? j1 + 1 : j0 - 1) * w + i);
      const walls = buildYardShell({ ...court, tiles: longer }, w, FLOOR_H, b.biome, yardPicture);
      mergeFlat(walls);
      // the windows' plane; what stands in the yard is drawn only past the wall they are in (the balconies of other
      // floors on that side are in it), and not right up to that wall (its lamps and signs would stand at the glass)
      const away = new THREE.Vector3(-di, 0, -dj),
        glass = new THREE.Vector3(
          di > 0 ? (i1 + 2) * T : di < 0 ? (i0 - 1) * T : 0,
          0,
          dj > 0 ? (j1 + 2) * T : dj < 0 ? (j0 - 1) * T : 0,
        ),
        near = new THREE.Plane().setFromNormalAndCoplanarPoint(
          away,
          glass.clone().addScaledVector(away, YARD_WALL_CLEAR),
        ),
        far = new THREE.Plane().setFromNormalAndCoplanarPoint(away, glass.addScaledVector(away, T + YARD_GLASS_CLEAR)),
        clip = (o: THREE.Object3D) => (o.userData.yardWall ? near : far),
        root = new THREE.Group(),
        // (the longer walls follow the yard's own, which the floors move: enterFloor)
        yard: [THREE.Object3D, THREE.Object3D, number][] = [
          [shell, walls, -1],
          ...courtGroups.flatMap((g, m): [THREE.Object3D, THREE.Object3D, number][] => (g ? [[g, g, m]] : [])),
        ],
        parts = yard.map(([src, from, m]): [THREE.Object3D, THREE.Object3D, number] => {
          const c = seenThrough(from, v + 1, clip);
          c.visible = true;
          root.add(c);
          return [src, c, m];
        });
      all.add(root);
      yardCopies.push({ into: v + 1, root, parts, way: [di, dj] });
    });
    // (and the floors' own: a room round the corner of the yard is behind the wall of a window on it, seen at a slant)
    [shell, ...courtGroups.flatMap(g => (g ? [g] : [])), ...floorGroups].forEach(keepOutOfPanes);
  }
  // what its windows look out on (a sector with windows one sees out of: Look.outside)
  if (look?.outside) {
    const { backdrop, sky, ground, haze, blocks } = look.outside,
      band = buildBackdrop(backdrop, BACKDROP_R, BACKDROP_TALL, {
        sky,
        ground: { map: ground, haze, ...BACKDROP_GROUND },
      }),
      h = b.plans[0]!.gen.H,
      look3: OutsideLook = {
        facades: blocks.facades,
        roofs: blocks.roofs,
        storey: FACADE_M,
        roofTile: ROOF_M,
        light: blocks.light,
        roofLight: blocks.roofLight,
        haze,
        clear: BACKDROP_GROUND.clear,
        fade: BACKDROP_GROUND.fade,
        reach: BLOCK_REACH,
      },
      // The building as one straight mass: the floors of all its floors together, the narrow gaps between them filled
      // in (massOf), (with the walls round them for where the street begins: shellOf), from the street to its roof,
      // with a yard open through it (on the floors it passes and over them). Seen from the windows (buildingShell) its
      // outside is at the window, as if every wall
      // were as thin as its glass: a look out at a slant through a wall a tile thick would go through the thickness
      // into the building. (So from a window on a yard the yard's walls stand a tile further back than they do seen
      // from its balconies.) Painted as a yard (courtMesh.ts yardFacades); the blocks across the street stand round it
      floors = massOf(
        b.plans
          .map(p => Uint8Array.from(p.gen.maps.grid, (v, k) => (v === 1 || p.voids[k] ? 1 : 0)))
          .reduce((u, f) => u.map((v, k) => v | f[k]!), new Uint8Array(w * h)),
        w,
        h,
      ),
      mass = shellOf(k => !!floors[k], w, h),
      insides = b.plans.map((_, m) => {
        const f = Uint8Array.from(floors);
        if (b.court?.open && m <= b.court.lower) for (const k of b.court.tiles) f[k] = 0;
        return f;
      }),
      walls = yardFacades(b.biome, FLOOR_H),
      across = new THREE.Group();
    const rng = createRng(b.seed ^ OUTSIDE_SEED),
      round = outsideBlocks(mass, w, h, blocks.style, rng),
      street = look.outside.street;
    // (and what stands on the street among them: trees, lamps, poles)
    if (street)
      across.add(
        buildOutsideCards(
          outsideStreet(mass, w, h, round, street.things, rng),
          { haze, clear: BACKDROP_GROUND.clear, fade: BACKDROP_GROUND.fade, reach: BLOCK_REACH, ...street },
          BACKDROP_R,
        ),
      );
    across.add(
      buildOutsideBlocks(round, look3, BACKDROP_R),
      buildOutsideBlocks(
        buildingShell(
          insides,
          w,
          h,
          FLOOR_H,
          (i, j, m, sides) => walls?.pick(i, j, m, sides.includes(1)) ?? 0,
          b.grounds.map(g => g - b.grounds[b.grounds.length - 1]!),
        ),
        walls
          ? {
              ...look3,
              facades: walls.facades,
              storey: [T, FLOOR_H],
              light: [0, 1, 2, 3].map(() => new THREE.Color(walls.shade).toArray() as [number, number, number]),
            }
          : { ...look3, storey: [FACADE_M[0], FLOOR_H * SHELL_STOREYS] },
        BACKDROP_R,
      ),
    );
    all.add(band, across);
    outside = { band, across };
  }
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
    g.position.y = b.grounds[m]! - b.grounds[n]!;
    courtGroups[m]?.position.setY(g.position.y);
  });
  yardShell?.position.setY(-b.grounds[n]!);
  for (const y of yardCopies) for (const [src, c] of y.parts) c.position.copy(src.position);
  if (outside) {
    const street = b.grounds[b.grounds.length - 1]! - b.grounds[n]!;
    outside.band.groundY = street;
    outside.across.position.y = street;
  }
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
// The hall of the boss area: a fixed, plain map with no enemy and no pickup, where the run enters the depth. The gates
// are made by the caller (portals.ts imports this file): their places are returned, in world coordinates. The hall's
// look is the sectors run together (world/looks.ts MIX), its music BIOMES[0] (DATA) for now.
export function buildHall(biome: Biome): {
  start: [number, number];
  extract: [number, number];
  terminal: [number, number];
  roomGates: [number, number][]; // the gates into the boss rooms: the north row west to east, then the south row
  next: [number, number]; // the gate on from the boss area, once its last boss is down
  titan: [number, number]; // the gate to TITAN, once the eight rooms are down
} {
  buildFixedLevel(biome, { rows: HALL_ROWS, rooms: [HALL_ROOM], start: 0, exit: 0 });
  const [sx, sz] = roomSpot(level.rooms[level.startIdx]!);
  computeFlow(tileCoord(sx), tileCoord(sz));
  const row = (dz: number): [number, number][] => HALL_ROOM_GATE_X.map(x => [sx + x, sz + dz]);
  return {
    start: [sx, sz],
    extract: [sx + HALL_SIDE_GAP, sz],
    terminal: [sx + HALL_MID_GAP, sz],
    roomGates: [...row(-HALL_ROOM_GATE_Z), ...row(HALL_ROOM_GATE_Z)],
    titan: [sx - HALL_SIDE_GAP, sz],
    next: [sx - HALL_MID_GAP, sz],
  };
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
// The boss door goes on the map as soon as the player looks at it: in front of them, no farther than `range` (how far
// things can be made out in the fog, m), with a clear line to the corridor just outside it. (reveal does not open it
// from the corridor: a shut door's tile is solid, so no line reaches its middle.) Called every frame on a building floor
export function sightHallDoor(x: number, z: number, yaw: number, range: number) {
  const hall = level.hall;
  if (!hall || level.seen[hall.door]) return;
  const into = [1, -1, W, -W].find(d => level.roomOf[hall.door + d] === hall.room);
  if (into === undefined) return;
  const out = Math.abs(into) === 1 ? [-into, 0] : [0, -Math.sign(into)],
    dx = tileCenter(hall.door % W) + out[0]! * DOOR_SIGHT_OUT - x,
    dz = tileCenter(Math.floor(hall.door / W)) + out[1]! * DOOR_SIGHT_OUT - z;
  if (Math.hypot(dx, dz) > range) return;
  if (Math.abs(wrapAngle(yawToward(dx, dz) - yaw)) > DOOR_SIGHT_CONE) return;
  if (hasLOS(x, z, x + dx, z + dz)) level.seen[hall.door] = 1;
}
