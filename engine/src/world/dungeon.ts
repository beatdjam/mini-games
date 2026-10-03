import type { Rng } from '../core/util.ts';
import { COVER_H, DECK_H, SIDE_NX, SIDE_NZ, SIDE_PX, SIDE_PZ } from './tiles.ts';
// engine: Grid dungeon generation: rooms joined by corridors, then optional passes (raised decks, rubble, bridges).
// Everything random draws from the rng you pass, so the same seed gives the same dungeon. No three.js, no DOM.
// The maps use the same encoding as the tile world (world/tiles.ts), so they can go straight into setTileWorld.
// ---- tuning numbers used only here ----
const GEN_MAP_SIZE = 36; // default map side (tiles)
const GEN_ROOM_COUNT: [number, number] = [5, 6]; // default number of rooms (min, max)
const GEN_ROOM_SIZE: [number, number] = [4, 7]; // default room side (min, max, tiles)
const GEN_ROOM_TRIES = 1000; // attempts to place the rooms
const ROOM_GAP = 2; // rooms keep this many tiles apart
const EXTRA_LINK_MIN_ROOMS = 4; // with more rooms than this, one extra corridor makes a loop
const EXTRA_LINK_FIRST_TARGET = 2; // the extra corridor ends at a room this far or further along the order (1 is already linked)
const CORRIDOR_X_FIRST_CHANCE = 0.5; // chance a corridor runs along x first and then y (otherwise y first, then x)
const BIG_ROOM = 6; // a room at least this wide and tall (tiles) can hold a deck or pillars; must stay 5 or more (see addPillars)
const PILLAR_CHANCE = 0.5; // chance a big room (without rubble) gets two pillars
const BRIDGE_MIN_LEN = 5; // shortest straight corridor run (tiles) that can become a walkway

// a room on the tile grid (tiles); plat = has a raised deck
export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  plat?: boolean;
}
// the per-tile maps of a level, indexed j * W + i (grid: 1 = floor, 0 = wall; the others as in world/tiles.ts)
export interface TileMaps {
  grid: Uint8Array;
  hgt: Float32Array;
  ramp: Int8Array; // -1 = flat
  cover: Uint8Array;
  roomOf: Int8Array; // index of the room the tile is in (-1 = none)
  // only on maps that have doors (setDoor makes them; same meaning as in TileWorld, doors start shut)
  door?: Uint8Array;
  doorOpen?: Float32Array;
}
export interface TileMapData {
  W: number;
  H: number;
  maps: TileMaps;
  rooms: Room[];
}
// every field is optional; a missing (or 0) one takes the default
export interface DungeonOptions {
  map?: number; // map side (tiles)
  countMin?: number; // number of rooms
  countMax?: number;
  roomMin?: number; // room side (tiles)
  roomMax?: number;
  corridorW?: number; // corridor width (tiles)
  platform?: number; // chance a big room gets a raised deck
  rubble?: number; // chance per tile of cover in a room (rooms with rubble get no pillars)
  bridges?: number; // how many straight corridor runs become raised walkways
  deckH?: number; // height of decks and walkways (m)
  coverH?: number; // height of cover (m)
  doors?: boolean; // a door in every room doorway (see addDoorways); no random numbers. Off: no door maps at all
}

export function newTileMaps(w: number, h: number): TileMaps {
  return {
    grid: new Uint8Array(w * h),
    hgt: new Float32Array(w * h),
    ramp: new Int8Array(w * h).fill(-1),
    cover: new Uint8Array(w * h),
    roomOf: new Int8Array(w * h).fill(-1),
  };
}

// Places rooms, links them with corridors (nearest-first order plus one loop), then runs the passes the options ask
// for. The random numbers are drawn in a fixed order: rooms, corridors, per room (deck or pillars, rubble), bridges.
// The doorways take none, so `doors` changes nothing else about the map except that bridges avoid the door tiles.
export function generateDungeon(o: DungeonOptions, rng: Rng): TileMapData {
  const size = o.map || GEN_MAP_SIZE;
  const maps = newTileMaps(size, size);
  const rooms = placeRooms(o, size, rng);
  carveRooms(maps.grid, size, rooms);
  carveCorridors(maps.grid, size, o.corridorW || 1, rooms, rng);
  markRoomIds(maps, size, rooms);
  decorateRooms(maps, size, rooms, o, rng);
  if (o.doors) addDoorways(maps, size);
  if (o.bridges) addBridges(maps, size, size, o.bridges, rng, o.deckH);
  return { W: size, H: size, maps, rooms };
}

// puts a door on floor tile k, making the door maps first if the maps have none (the door starts shut)
export function setDoor(maps: TileMaps, k: number) {
  if (!maps.door) maps.door = new Uint8Array(maps.grid.length);
  if (!maps.doorOpen) maps.doorOpen = new Float32Array(maps.grid.length);
  maps.door[k] = 1;
}
// Doors on the doorways: a corridor tile (outside every room) that touches a room tile along x or along y, has wall on
// both of its other two sides and floor straight on beyond. A corridor of width 2 or more has no such tile. The map
// must have its rooms marked (roomOf). No random numbers.
export function addDoorways(maps: TileMaps, size: number) {
  const g = maps.grid,
    roomOf = maps.roomOf,
    inRoom = (t: number) => g[t] === 1 && roomOf[t] >= 0, // a floor tile of a room
    inCorridor = (t: number) => g[t] === 1 && roomOf[t] < 0;
  for (let j = 1; j < size - 1; j++)
    for (let i = 1; i < size - 1; i++) {
      const k = j * size + i;
      if (!inCorridor(k)) continue;
      // [the tiles before and after along the axis, the two across it], once along x and once along y
      for (const [a, b, c, d] of [
        [k - 1, k + 1, k - size, k + size],
        [k - size, k + size, k - 1, k + 1],
      ])
        if (((inRoom(a) && inCorridor(b)) || (inRoom(b) && inCorridor(a))) && !g[c] && !g[d]) setDoor(maps, k);
    }
}

// the middle tile of a room (x, y)
function roomCenter(r: Room): [number, number] {
  return [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
}
// calls fn(i, j) for every tile of the room, row by row
export function forEachRoomTile(r: Room, fn: (i: number, j: number) => void) {
  for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) fn(i, j);
}

// Draws the room count, then tries random rectangles (one random number each for width, height, x, y) and keeps the
// ones that stay ROOM_GAP away from the rooms already placed.
function placeRooms(o: DungeonOptions, size: number, rng: Rng): Room[] {
  const count = rng.randi(o.countMin || GEN_ROOM_COUNT[0], o.countMax || GEN_ROOM_COUNT[1]);
  const roomMin = o.roomMin || GEN_ROOM_SIZE[0];
  const roomMax = o.roomMax || GEN_ROOM_SIZE[1];
  const rooms: Room[] = [];
  let tries = 0;
  while (rooms.length < count && tries++ < GEN_ROOM_TRIES) {
    const rw = rng.randi(roomMin, roomMax);
    const rh = rng.randi(roomMin, roomMax);
    const x = rng.randi(1, size - rw - 1);
    const y = rng.randi(1, size - rh - 1);
    const tooClose = rooms.some(
      q => x < q.x + q.w + ROOM_GAP && x + rw + ROOM_GAP > q.x && y < q.y + q.h + ROOM_GAP && y + rh + ROOM_GAP > q.y,
    );
    if (tooClose) continue;
    rooms.push({ x, y, w: rw, h: rh });
  }
  return rooms;
}

// floor under every room
function carveRooms(grid: Uint8Array, size: number, rooms: Room[]) {
  rooms.forEach(r =>
    forEachRoomTile(r, (i, j) => {
      grid[j * size + i] = 1;
    }),
  );
}

// the room each tile is in (roomOf), by index in `rooms`
function markRoomIds(maps: TileMaps, size: number, rooms: Room[]) {
  rooms.forEach((r, idx) =>
    forEachRoomTile(r, (i, j) => {
      maps.roomOf[j * size + i] = idx;
    }),
  );
}

// distance between two room centers (as floats, so it is not rounded to tiles like roomCenter)
function roomDistance(a: Room, b: Room): number {
  return Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2);
}

// rooms in visiting order: start at the first room, then always the nearest one not yet visited
function orderByNearest(rooms: Room[]): Room[] {
  const order = [rooms[0]];
  const remaining = rooms.slice(1);
  while (remaining.length) {
    const last = order[order.length - 1];
    remaining.sort((a, b) => roomDistance(a, last) - roomDistance(b, last));
    order.push(remaining.shift()!); // the loop condition says remaining is not empty
  }
  return order;
}

// floor on a width x width square whose top-left tile is (i, j); the outer ring of the map stays wall
function carveSquare(grid: Uint8Array, size: number, width: number, i: number, j: number) {
  for (let a = 0; a < width; a++)
    for (let b = 0; b < width; b++) {
      const x = i + a;
      const y = j + b;
      if (x > 0 && y > 0 && x < size - 1 && y < size - 1) grid[y * size + x] = 1;
    }
}

// an L-shaped corridor from the middle of one room to the middle of another; one random number picks which leg is first
function carveCorridor(grid: Uint8Array, size: number, width: number, from: Room, to: Room, rng: Rng) {
  let [x, y] = roomCenter(from);
  const [targetX, targetY] = roomCenter(to);
  const carveAlongX = () => {
    while (x !== targetX) {
      carveSquare(grid, size, width, x, y);
      x += Math.sign(targetX - x);
    }
  };
  const carveAlongY = () => {
    while (y !== targetY) {
      carveSquare(grid, size, width, x, y);
      y += Math.sign(targetY - y);
    }
  };
  if (rng.next() < CORRIDOR_X_FIRST_CHANCE) {
    carveAlongX();
    carveAlongY();
  } else {
    carveAlongY();
    carveAlongX();
  }
  carveSquare(grid, size, width, x, y);
}

// corridors between each room and the next one in nearest-first order, plus one extra from the first room to a later one
// (a loop) when there are enough rooms
function carveCorridors(grid: Uint8Array, size: number, width: number, rooms: Room[], rng: Rng) {
  const order = orderByNearest(rooms);
  for (let k = 1; k < order.length; k++) carveCorridor(grid, size, width, order[k - 1], order[k], rng);
  if (order.length > EXTRA_LINK_MIN_ROOMS) {
    const target = order[rng.randi(EXTRA_LINK_FIRST_TARGET, order.length - 1)];
    carveCorridor(grid, size, width, order[0], target, rng);
  }
}

// two wall tiles one tile in from opposite corners of a big room
function addPillars(grid: Uint8Array, size: number, r: Room) {
  // Neither pillar can be on the room's middle tile (so no check is needed): with a width of 5 or more, the middle
  // column x + floor(w / 2) is right of the first pillar's column (x + 1) and left of the second's (x + w - 2).
  grid[(r.y + 1) * size + r.x + 1] = 0;
  grid[(r.y + r.h - 2) * size + r.x + r.w - 2] = 0;
}

// per room, in order: a deck (chance `platform`) or else pillars (big rooms; not when there is rubble), then rubble
function decorateRooms(maps: TileMaps, size: number, rooms: Room[], o: DungeonOptions, rng: Rng) {
  rooms.forEach(r => {
    const big = r.w >= BIG_ROOM && r.h >= BIG_ROOM;
    if (big && rng.next() < (o.platform || 0)) addPlatform(maps, size, r, o.deckH);
    else if (big && !o.rubble && rng.next() < PILLAR_CHANCE) addPillars(maps.grid, size, r);
    if (o.rubble) addRubble(maps, size, r, o.rubble, rng, o.coverH);
  });
}

// An open square arena: floor from tile `from` up to (not including) `to`, plus walls on the `pillars` tiles ([i, j]).
// The one room covers the floor (roomOf stays -1 everywhere). No random numbers.
export function generateArena(size: number, from: number, to: number, pillars: [number, number][]): TileMapData {
  const maps = newTileMaps(size, size);
  for (let j = from; j < to; j++) for (let i = from; i < to; i++) maps.grid[j * size + i] = 1;
  pillars.forEach(([i, j]) => {
    maps.grid[j * size + i] = 0;
  });
  return { W: size, H: size, maps, rooms: [{ x: from, y: from, w: to - from, h: to - from }] };
}

// raised deck inside the room; the outer ring stays at ground level so every doorway still connects
export function addPlatform(maps: TileMaps, w: number, r: Room, deckH = DECK_H) {
  for (let j = r.y + 2; j <= r.y + r.h - 2; j++)
    for (let i = r.x + 1; i <= r.x + r.w - 2; i++) maps.hgt[j * w + i] = deckH;
  // the ramp up to the deck: in the ring's top row, in the middle column, rising toward the deck
  const k = (r.y + 1) * w + roomCenter(r)[0];
  maps.ramp[k] = SIDE_PZ;
  maps.hgt[k] = 0;
  r.plat = true;
}
// waist-high cover scattered in the room (rate = chance per tile); never on the middle, next to other cover or on a deck
export function addRubble(maps: TileMaps, w: number, r: Room, rate: number, rng: Rng, coverH = COVER_H) {
  const [cx, cy] = roomCenter(r);
  for (let j = r.y + 1; j <= r.y + r.h - 2; j++)
    for (let i = r.x + 1; i <= r.x + r.w - 2; i++) {
      const k = j * w + i;
      if ((i === cx && j === cy) || maps.hgt[k] > 0 || maps.ramp[k] >= 0 || rng.next() > rate) continue;
      let ok = true;
      for (let dj = -1; dj <= 1 && ok; dj++)
        for (let di = -1; di <= 1; di++) {
          const n = (j + dj) * w + i + di;
          if (maps.cover[n] || maps.ramp[n] >= 0 || maps.hgt[n] > 0) {
            ok = false;
            break;
          }
        }
      if (ok) {
        maps.cover[k] = 1;
        maps.hgt[k] = coverH;
      }
    }
}

// a straight corridor run: hor = runs along x (else along y); a..b = its first and last tile along the run;
// c = the row (hor) or column of the run
interface BridgeRun {
  hor: boolean;
  a: number;
  b: number;
  c: number;
}
// index of the tile at position t along the run line c (a row when hor, else a column)
const runTile = (w: number, hor: boolean, c: number, t: number): number => (hor ? c * w + t : t * w + c);
// a corridor tile that nothing is built on yet
const isFreeCorridor = (maps: TileMaps, k: number): boolean =>
  maps.grid[k] === 1 &&
  maps.roomOf[k] < 0 &&
  maps.hgt[k] === 0 &&
  maps.ramp[k] < 0 &&
  !maps.cover[k] &&
  !maps.door?.[k];
// the straight runs (at least BRIDGE_MIN_LEN long, walls on both sides) along x (hor) or along y, line by line
function findBridgeRuns(maps: TileMaps, w: number, h: number, hor: boolean): BridgeRun[] {
  const g = maps.grid;
  const lineCount = hor ? h : w; // rows when scanning along x, else columns
  const lineLen = hor ? w : h; // tiles along one line
  const sideStep = hor ? w : 1; // index step to the tile on either side of a line
  const runs: BridgeRun[] = [];
  for (let c = 1; c < lineCount - 1; c++) {
    let start = -1;
    for (let t = 1; t < lineLen; t++) {
      const k = runTile(w, hor, c, t);
      const ok = t < lineLen - 1 && isFreeCorridor(maps, k) && !g[k - sideStep] && !g[k + sideStep];
      if (ok && start < 0) start = t;
      if (!ok && start >= 0) {
        if (t - start >= BRIDGE_MIN_LEN) runs.push({ hor, a: start, b: t - 1, c });
        start = -1;
      }
    }
  }
  return runs;
}
// straight 1-wide corridor runs (walls on both sides) become raised walkways with a ramp at each end
export function addBridges(maps: TileMaps, w: number, h: number, count: number, rng: Rng, deckH = DECK_H) {
  const runs = [...findBridgeRuns(maps, w, h, true), ...findBridgeRuns(maps, w, h, false)];
  rng
    .shuffle(runs)
    .slice(0, count)
    .forEach(r => {
      const tile = (t: number) => runTile(w, r.hor, r.c, t);
      maps.ramp[tile(r.a)] = r.hor ? SIDE_PX : SIDE_PZ;
      maps.ramp[tile(r.b)] = r.hor ? SIDE_NX : SIDE_NZ;
      for (let t = r.a + 1; t < r.b; t++) maps.hgt[tile(t)] = deckH;
    });
}
