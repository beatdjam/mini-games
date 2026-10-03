import type { Rng } from '../core/util.ts';
import { forEachRoomTile, generateDungeon, tileWorldOf } from './dungeon.ts';
import type { DungeonOptions, TileMapData } from './dungeon.ts';
import { createFloors } from './floors.ts';
import type { FloorLink, FloorSpot, Floors } from './floors.ts';
// engine: Random maps of several floors: one generated dungeon per floor, joined by stairs (and lifts if asked) between
// neighbouring floors. Every pair of neighbouring floors gets at least one stairs, so movers that never ride a lift can
// still reach every floor. Everything random draws from the rng you pass, so the same seed gives the same floors.
// ---- tuning numbers (a game can pass its own through FloorGenOptions) ----
export const FLOOR_H = 8; // height between the ground of one floor and the next (m)
export const STAIRS_KIND = 'stairs'; // FloorLink.kind of the stairs
export const LIFT_KIND = 'elevator'; // FloorLink.kind of the lifts

export interface FloorGenOptions {
  floors: number; // how many floors (1 or more)
  dungeon?: DungeonOptions | DungeonOptions[]; // generateDungeon options for every floor, or one per floor
  stairs?: number; // stairs between each pair of neighbouring floors (default 1; fewer than 1 counts as 1)
  lifts?: number; // lifts between each pair of neighbouring floors (default 0)
  floorH?: number; // m, see FLOOR_H
  stairsKind?: string; // see STAIRS_KIND
  liftKind?: string; // see LIFT_KIND
}
export interface GeneratedFloors {
  maps: TileMapData[]; // per floor, from generateDungeon (rooms included)
  links: FloorLink[]; // the stairs and lifts, floor pair by floor pair: the stairs first, then the lifts
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
function pickSpot(m: TileMapData, floor: number, used: Set<number>, usedRooms: Set<number>, rng: Rng): FloorSpot {
  const tilesOf = m.rooms.map(r => {
    const list: number[] = [];
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

// Makes the floors: generateDungeon for floor 0, 1, ... in order, then for each pair of neighbouring floors (0-1, 1-2,
// ...) its stairs and then its lifts, each drawing the end on the lower floor and then the one on the upper floor.
// The ends sit on flat room tiles, never on a door, a deck, a ramp, cover or another link's end. Throws when `floors`
// is not a whole number of 1 or more, when an options list does not have one entry per floor, or when a floor runs
// out of room tiles for the links
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
  const stairs = Math.max(1, Math.floor(o.stairs ?? 1)),
    lifts = Math.max(0, Math.floor(o.lifts ?? 0));
  for (let lo = 0; lo + 1 < count; lo++) {
    for (let s = 0; s < stairs; s++) join(o.stairsKind ?? STAIRS_KIND, lo);
    for (let s = 0; s < lifts; s++) join(o.liftKind ?? LIFT_KIND, lo);
  }
  const floorH = o.floorH ?? FLOOR_H;
  return {
    maps,
    links,
    floors: createFloors(
      maps.map(tileWorldOf),
      maps.map((_, n) => n * floorH),
      links,
    ),
  };
}
