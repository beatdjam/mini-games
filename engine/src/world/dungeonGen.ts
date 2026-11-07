import type { Rng } from '../core/util.ts';
import { SIDE_STEP } from './tiles.ts';
import type { TileWorld } from './tiles.ts';
import type { Room, TileMaps } from './dungeonBase.ts';
import { forEachRoomTile, roomCenter } from './dungeonBase.ts';
import { addBridges, addPlatform, addRubble } from './dungeonDecor.ts';
// engine: Grid dungeon generation: rooms joined by corridors, then the decoration passes (dungeonDecor.ts).
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
const HALL_GAP = 3; // the hall keeps this many tiles from the other rooms and from the map's edge (room for a corridor to pass)

export interface TileMapData {
  W: number;
  H: number;
  maps: TileMaps;
  rooms: Room[];
  // only with the `hall` option: its index in `rooms` (always the last one) and the tile of its one door
  hall?: { room: number; door: number };
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
  // One more room of this size (tiles) with a single way in: no corridor runs through it, and one 1-wide corridor
  // with a door (always, whatever `doors` says) joins it to the nearest room. It gets no deck, pillars or rubble.
  // For a room the game closes off (a boss room, say). See generateDungeon
  hall?: { w: number; h: number };
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
// With `hall`, the hall is placed first (two random numbers: x, y), HALL_GAP tiles from the map's edge; the other rooms
// keep HALL_GAP from it and their corridors go round it (see carveCorridor), so the hall's door is its only way in.
// The hall is the last entry of `rooms` and `hall` in the result tells its index and its door's tile. Without `hall`
// the map and the random numbers drawn are what they are without the option. Throws when the hall does not fit the
// map or no other room could be placed
export function generateDungeon(o: DungeonOptions, rng: Rng): TileMapData {
  const size = o.map || GEN_MAP_SIZE;
  const maps = newTileMaps(size, size);
  const hall = o.hall ? placeHall(o.hall, size, rng) : undefined;
  const rooms = placeRooms(o, size, rng, hall);
  carveRooms(maps.grid, size, rooms);
  carveCorridors(maps.grid, size, o.corridorW || 1, rooms, rng, hall);
  const door = hall ? linkHall(maps, size, rooms, hall) : -1;
  if (hall) rooms.push(hall);
  markRoomIds(maps, size, rooms);
  decorateRooms(maps, size, hall ? rooms.slice(0, -1) : rooms, o, rng);
  if (o.doors) addDoorways(maps, size);
  if (o.bridges) addBridges(maps, size, size, o.bridges, rng, o.deckH);
  const d: TileMapData = { W: size, H: size, maps, rooms };
  if (hall) d.hall = { room: rooms.length - 1, door };
  return d;
}

// A TileWorld for generated (or fixed) maps: the maps themselves, not copies, with new flow buffers. The door maps go
// along when the maps have them. Hand it to setTileWorld or createFloors
export function tileWorldOf(d: TileMapData): TileWorld {
  const n = d.W * d.H,
    M = d.maps;
  const w: TileWorld = {
    W: d.W,
    H: d.H,
    grid: M.grid,
    hgt: M.hgt,
    ramp: M.ramp,
    cover: M.cover,
    flow: new Int16Array(n),
    flowQ: new Int32Array(n),
  };
  if (M.door) {
    w.door = M.door;
    w.doorOpen = M.doorOpen;
  }
  // locks are set on the world while the game runs (lockDoor), so a new world starts with none
  return w;
}

// puts a door on floor tile k, making the door maps first if the maps have none (the door starts shut)
export function setDoor(maps: TileMaps, k: number) {
  if (!maps.door) maps.door = new Uint8Array(maps.grid.length);
  if (!maps.doorOpen) maps.doorOpen = new Float32Array(maps.grid.length);
  maps.door[k] = 1;
}
// Doors on the doorways: a corridor tile (outside every room) that touches a room tile along x or along y, has wall on
// both of its other two sides and floor straight on beyond. A corridor 2 wide gets a door on both of its tiles, side
// by side (each has the other on one side and wall on the far side); a wider one has no such tile. The map must have
// its rooms marked (roomOf). No random numbers.
export function addDoorways(maps: TileMaps, size: number) {
  const g = maps.grid,
    roomOf = maps.roomOf,
    inRoom = (t: number) => g[t] === 1 && roomOf[t] >= 0, // a floor tile of a room
    inCorridor = (t: number) => g[t] === 1 && roomOf[t] < 0,
    // is tile k a corridor's last tile before a room along `along`: 1 the room is behind it, -1 ahead, 0 it is not
    way = (k: number, along: number): number =>
      inRoom(k - along) && inCorridor(k + along) ? 1 : inRoom(k + along) && inCorridor(k - along) ? -1 : 0;
  for (let j = 1; j < size - 1; j++)
    for (let i = 1; i < size - 1; i++) {
      const k = j * size + i;
      if (!inCorridor(k)) continue;
      // [the step along the corridor, the step across it], once along x and once along y
      for (const [along, across] of [
        [1, size],
        [size, 1],
      ]) {
        const w = way(k, along);
        if (!w) continue;
        if (!g[k - across] && !g[k + across]) setDoor(maps, k);
        // one half of a doorway 2 wide: wall on one side, on the other a tile that is the same kind of doorway with
        // wall beyond it
        for (const side of [across, -across])
          if (!g[k - side] && inCorridor(k + side) && way(k + side, along) === w && !g[k + side + side])
            setDoor(maps, k);
      }
    }
}

// the hall with its ring of wall: no corridor may touch these tiles (only the hall's own door is cut into the ring)
const hallZone = (hall: Room): Room => ({ x: hall.x - 1, y: hall.y - 1, w: hall.w + 2, h: hall.h + 2 });
const inZone = (zone: Room, i: number, j: number): boolean =>
  i >= zone.x && i < zone.x + zone.w && j >= zone.y && j < zone.y + zone.h;
// would a corridor square of this width with its top-left tile at (i, j) touch the zone
function squareInZone(zone: Room, width: number, i: number, j: number): boolean {
  for (let a = 0; a < width; a++) for (let b = 0; b < width; b++) if (inZone(zone, i + a, j + b)) return true;
  return false;
}

// Draws where the hall goes (x, then y), HALL_GAP tiles or more from the map's edge. Throws when the map is too small
function placeHall(want: { w: number; h: number }, size: number, rng: Rng): Room {
  const { w, h } = want;
  if (!(w >= 1 && h >= 1) || w + 2 * HALL_GAP > size || h + 2 * HALL_GAP > size)
    throw new Error(`generateDungeon: a ${w} x ${h} hall does not fit a map of ${size}`);
  const x = rng.randi(HALL_GAP, size - w - HALL_GAP);
  const y = rng.randi(HALL_GAP, size - h - HALL_GAP);
  return { x, y, w, h };
}

// The hall's one way in: a door just outside the middle of the side that faces the nearest room, and a 1-wide corridor
// from there to that room's middle that keeps off the hall's ring of wall. Carves the hall too. No random numbers.
// Returns the door's tile. Throws when there is no other room
function linkHall(maps: TileMaps, size: number, rooms: Room[], hall: Room): number {
  if (!rooms.length) throw new Error('generateDungeon: no room could be placed next to the hall');
  carveRooms(maps.grid, size, [hall]);
  const near = rooms.reduce((best, r) => (roomDistance(r, hall) < roomDistance(best, hall) ? r : best));
  const [hx, hy] = roomCenter(hall);
  const [rx, ry] = roomCenter(near);
  const alongX = Math.abs(rx - hx) >= Math.abs(ry - hy);
  const di = alongX ? (rx >= hx ? 1 : -1) : 0;
  const dj = alongX ? 0 : ry >= hy ? 1 : -1;
  // the door: one tile outside the hall, in the middle of that side; the corridor starts one tile further out
  const doorI = di > 0 ? hall.x + hall.w : di < 0 ? hall.x - 1 : hx;
  const doorJ = dj > 0 ? hall.y + hall.h : dj < 0 ? hall.y - 1 : hy;
  const door = doorJ * size + doorI;
  maps.grid[door] = 1;
  setDoor(maps, door);
  routeAround(size, 1, [doorI + di, doorJ + dj], [rx, ry], hallZone(hall)).forEach(([i, j]) => {
    maps.grid[j * size + i] = 1;
  });
  return door;
}

// The shortest way from one tile to another over the inside of the map (walls or floor alike) for a corridor of this
// width that never touches the zone. Breadth first, the four sides in the order of SIDE_STEP. No random numbers.
// Throws when there is none
function routeAround(
  size: number,
  width: number,
  from: [number, number],
  to: [number, number],
  zone: Room,
): [number, number][] {
  const open = (i: number, j: number) =>
    i > 0 && j > 0 && i < size - 1 && j < size - 1 && !squareInZone(zone, width, i, j);
  const prev = new Int32Array(size * size).fill(-1);
  const start = from[1] * size + from[0];
  const goal = to[1] * size + to[0];
  const queue = [start];
  prev[start] = start;
  for (let n = 0; n < queue.length && prev[goal] < 0; n++) {
    const c = queue[n];
    for (const [a, b] of SIDE_STEP) {
      const i = (c % size) + a;
      const j = Math.floor(c / size) + b;
      if (!open(i, j) || prev[j * size + i] >= 0) continue;
      prev[j * size + i] = c;
      queue.push(j * size + i);
    }
  }
  if (!open(from[0], from[1]) || prev[goal] < 0)
    throw new Error(`generateDungeon: no way round the hall from (${from}) to (${to})`);
  const path: [number, number][] = [];
  for (let c = goal; ; c = prev[c]) {
    path.push([c % size, Math.floor(c / size)]);
    if (c === start) break;
  }
  return path.reverse();
}

// Draws the room count, then tries random rectangles (one random number each for width, height, x, y) and keeps the
// ones that stay ROOM_GAP away from the rooms already placed (and HALL_GAP away from the hall, when there is one).
function placeRooms(o: DungeonOptions, size: number, rng: Rng, hall?: Room): Room[] {
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
    const g = HALL_GAP;
    if (hall && x < hall.x + hall.w + g && x + rw + g > hall.x && y < hall.y + hall.h + g && y + rh + g > hall.y)
      continue;
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

// the tiles of an L-shaped way from the middle of one room to the middle of another, along x first or along y first
function cornerPath(from: Room, to: Room, xFirst: boolean): [number, number][] {
  let [x, y] = roomCenter(from);
  const [targetX, targetY] = roomCenter(to);
  const path: [number, number][] = [];
  const alongX = () => {
    while (x !== targetX) {
      path.push([x, y]);
      x += Math.sign(targetX - x);
    }
  };
  const alongY = () => {
    while (y !== targetY) {
      path.push([x, y]);
      y += Math.sign(targetY - y);
    }
  };
  if (xFirst) {
    alongX();
    alongY();
  } else {
    alongY();
    alongX();
  }
  path.push([x, y]);
  return path;
}
// An L-shaped corridor from the middle of one room to the middle of another; one random number picks which leg is
// first. With a hall, an L that would touch the hall or its ring of wall gives way to the other L, and when both
// touch, to the shortest way round (routeAround); the random number is drawn all the same
function carveCorridor(grid: Uint8Array, size: number, width: number, from: Room, to: Room, rng: Rng, hall?: Room) {
  const xFirst = rng.next() < CORRIDOR_X_FIRST_CHANCE;
  let path = cornerPath(from, to, xFirst);
  if (hall) {
    const zone = hallZone(hall);
    const touches = (p: [number, number][]) => p.some(([i, j]) => squareInZone(zone, width, i, j));
    if (touches(path)) {
      const other = cornerPath(from, to, !xFirst);
      path = touches(other) ? routeAround(size, width, roomCenter(from), roomCenter(to), zone) : other;
    }
  }
  path.forEach(([i, j]) => carveSquare(grid, size, width, i, j));
}

// corridors between each room and the next one in nearest-first order, plus one extra from the first room to a later one
// (a loop) when there are enough rooms
function carveCorridors(grid: Uint8Array, size: number, width: number, rooms: Room[], rng: Rng, hall?: Room) {
  if (!rooms.length) return;
  const order = orderByNearest(rooms);
  for (let k = 1; k < order.length; k++) carveCorridor(grid, size, width, order[k - 1], order[k], rng, hall);
  if (order.length > EXTRA_LINK_MIN_ROOMS) {
    const target = order[rng.randi(EXTRA_LINK_FIRST_TARGET, order.length - 1)];
    carveCorridor(grid, size, width, order[0], target, rng, hall);
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
