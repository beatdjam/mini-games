import type { Rng } from '../core/util.ts';
import { forEachRoomTile, generateDungeon, tileWorldOf } from './dungeon.ts';
import type { DungeonOptions, TileMapData } from './dungeon.ts';
import { createFloors } from './floors.ts';
import type { FloorLink, FloorSpot, Floors } from './floors.ts';
// engine: Random maps of several floors: one generated dungeon per floor, joined by stairs and lifts between
// neighbouring floors. By default every pair of neighbouring floors gets one stairs, so movers that never ride a lift
// reach every floor; a pair can be given no stairs (only lifts join it), and a floor can get rooms of its own that only
// a lift reaches (liftRooms). Everything random draws from the rng you pass, so the same seed gives the same floors.
// ---- tuning numbers (a game can pass its own through FloorGenOptions) ----
export const FLOOR_H = 8; // height between the ground of one floor and the next (m)
export const STAIRS_KIND = 'stairs'; // FloorLink.kind of the stairs
export const LIFT_KIND = 'elevator'; // FloorLink.kind of the lifts
export const LIFT_ROOM_SIZE: [number, number] = [4, 5]; // side of a lift-only room (min, max, tiles)
const LIFT_ROOM_GAP = 2; // a lift-only room keeps this many tiles of wall from every floor tile
const LIFT_ROOM_TRIES = 200; // random places tried for one lift-only room

export interface FloorGenOptions {
  floors: number; // how many floors (1 or more)
  dungeon?: DungeonOptions | DungeonOptions[]; // generateDungeon options for every floor, or one per floor
  stairs?: number | number[]; // stairs between each pair of neighbouring floors (default 1), or one count per pair
  lifts?: number; // lifts between each pair of neighbouring floors (default 0; a pair with no stairs gets at least 1)
  liftRooms?: number; // rooms on every floor that only a lift reaches (default 0), each with a lift to a neighbour floor
  liftRoomSize?: [number, number]; // see LIFT_ROOM_SIZE
  floorH?: number; // m, see FLOOR_H
  stairsKind?: string; // see STAIRS_KIND
  liftKind?: string; // see LIFT_KIND
}
export interface GeneratedFloors {
  maps: TileMapData[]; // per floor, from generateDungeon (rooms included)
  links: FloorLink[]; // floor pair by floor pair the stairs, then the lifts; then the lifts of the lift-only rooms
  liftRooms: { floor: number; room: number }[]; // the lift-only rooms placed (an index into maps[floor].rooms)
  floors: Floors; // createFloors made from the maps (tileWorldOf), baseY = floor * floorH, and the links
}

// A tile where a link can end: a flat floor tile inside a room (not a door, a deck, a ramp or cover), not used by
// another link yet
function freeSpot(m: TileMapData, used: Set<number>, k: number): boolean {
  const M = m.maps;
  return (
    M.grid[k] === 1 &&
    M.roomOf[k] >= 0 &&
    M.hgt[k] === 0 &&
    M.ramp[k] < 0 &&
    !M.cover[k] &&
    !(M.door && M.door[k]) &&
    !used.has(k)
  );
}
// Picks the end of a link on one floor: a random room among those with a free tile, preferring rooms that hold no link
// end yet (so the stairs and lifts spread out), then a random free tile in it. Two random numbers. Throws when the
// floor has no free tile left
function pickSpot(
  m: TileMapData,
  floor: number,
  used: Set<number>,
  usedRooms: Set<number>,
  rng: Rng,
  only?: number, // the one room to pick from
  skip?: Set<number>, // rooms not to pick from
): FloorSpot {
  const tilesOf = m.rooms.map((r, id) => {
    const list: number[] = [];
    if ((only !== undefined && id !== only) || skip?.has(id)) return list;
    forEachRoomTile(r, (i, j) => {
      const k = j * m.W + i;
      if (freeSpot(m, used, k)) list.push(k);
    });
    return list;
  });
  const open = tilesOf.map((_, id) => id).filter(id => tilesOf[id].length),
    fresh = open.filter(id => !usedRooms.has(id));
  if (!open.length) throw new Error(`generateFloors: floor ${floor} has no room tile left for a link`);
  const room = rng.pick(fresh.length ? fresh : open),
    k = rng.pick(tilesOf[room]);
  used.add(k);
  usedRooms.add(room);
  return { floor, i: k % m.W, j: Math.floor(k / m.W) };
}

// Carves a room of its own on floor m, away from every floor tile (LIFT_ROOM_GAP tiles of wall all round), so nothing
// walks into it: a lift is its only way in. Draws the size (two numbers) and then up to LIFT_ROOM_TRIES places (two
// numbers each). Returns the room's index in m.rooms, or -1 when no place fits
function carveLiftRoom(m: TileMapData, size: [number, number], rng: Rng): number {
  const w = rng.randi(size[0], size[1]),
    h = rng.randi(size[0], size[1]),
    { W, H, maps: M } = m,
    g = LIFT_ROOM_GAP;
  if (w + 2 > W || h + 2 > H) return -1;
  const clear = (x: number, y: number) => {
    for (let j = y - g; j < y + h + g; j++)
      for (let i = x - g; i < x + w + g; i++) if (i >= 0 && j >= 0 && i < W && j < H && M.grid[j * W + i]) return false;
    return true;
  };
  for (let t = 0; t < LIFT_ROOM_TRIES; t++) {
    const x = rng.randi(1, W - w - 1),
      y = rng.randi(1, H - h - 1);
    if (!clear(x, y)) continue;
    const id = m.rooms.length;
    m.rooms.push({ x, y, w, h });
    forEachRoomTile(m.rooms[id], (i, j) => {
      M.grid[j * W + i] = 1;
      M.roomOf[j * W + i] = id;
    });
    return id;
  }
  return -1;
}

// Makes the floors: generateDungeon for floor 0, 1, ... in order, then for each pair of neighbouring floors (0-1, 1-2,
// ...) its stairs and then its lifts, each drawing the end on the lower floor and then the one on the upper floor;
// then floor by floor its lift-only rooms (carveLiftRoom), each with a lift from the room to the floor above (the one
// below on the top floor; the same floor when there is only one), the room's end drawn first. The far end is never in a lift-only room.
// The ends sit on flat room tiles, never on a door, a deck, a ramp, cover or another link's end; stairs and the pairs'
// lifts never end in a lift-only room (they are carved after). A lift-only room that finds no place is left out.
// Throws when `floors` is not a whole number of 1 or more, when an options list does not have one entry per floor or
// pair, or when a floor runs out of room tiles for the links
export function generateFloors(o: FloorGenOptions, rng: Rng): GeneratedFloors {
  const count = o.floors;
  if (!Number.isInteger(count) || count < 1) throw new Error(`generateFloors: floors must be 1 or more (${count})`);
  const per = o.dungeon ?? {};
  if (Array.isArray(per) && per.length !== count)
    throw new Error(`generateFloors: ${count} floors but ${per.length} dungeon options`);
  const maps: TileMapData[] = [];
  for (let n = 0; n < count; n++) maps.push(generateDungeon(Array.isArray(per) ? per[n] : per, rng));
  const used = maps.map(() => new Set<number>()),
    usedRooms = maps.map(() => new Set<number>()),
    links: FloorLink[] = [];
  const join = (kind: string, lo: number) => {
    const a = pickSpot(maps[lo], lo, used[lo], usedRooms[lo], rng),
      b = pickSpot(maps[lo + 1], lo + 1, used[lo + 1], usedRooms[lo + 1], rng);
    links.push({ kind, a, b });
  };
  const stairsOf = o.stairs ?? 1;
  if (Array.isArray(stairsOf) && stairsOf.length !== count - 1)
    throw new Error(`generateFloors: ${count - 1} floor pairs but ${stairsOf.length} stairs counts`);
  const lifts = Math.max(0, Math.floor(o.lifts ?? 0)),
    stairsKind = o.stairsKind ?? STAIRS_KIND,
    liftKind = o.liftKind ?? LIFT_KIND;
  for (let lo = 0; lo + 1 < count; lo++) {
    const stairs = Math.max(0, Math.floor(Array.isArray(stairsOf) ? stairsOf[lo] : stairsOf));
    for (let s = 0; s < stairs; s++) join(stairsKind, lo);
    // a pair with no stairs still needs a way between its floors
    for (let s = 0; s < (stairs ? lifts : Math.max(1, lifts)); s++) join(liftKind, lo);
  }
  const liftRooms: { floor: number; room: number }[] = [],
    liftOnly = maps.map(() => new Set<number>()), // per floor, its lift-only rooms
    perFloor = Math.max(0, Math.floor(o.liftRooms ?? 0));
  for (let n = 0; n < count; n++)
    for (let r = 0; r < perFloor; r++) {
      const room = carveLiftRoom(maps[n], o.liftRoomSize ?? LIFT_ROOM_SIZE, rng);
      if (room < 0) continue;
      const to = n + 1 < count ? n + 1 : n > 0 ? n - 1 : n,
        a = pickSpot(maps[n], n, used[n], usedRooms[n], rng, room),
        b = pickSpot(maps[to], to, used[to], usedRooms[to], rng, undefined, liftOnly[to]);
      links.push({ kind: liftKind, a, b });
      liftRooms.push({ floor: n, room });
      liftOnly[n].add(room);
    }
  const floorH = o.floorH ?? FLOOR_H;
  return {
    maps,
    links,
    liftRooms,
    floors: createFloors(
      maps.map(tileWorldOf),
      maps.map((_, n) => n * floorH),
      links,
    ),
  };
}
