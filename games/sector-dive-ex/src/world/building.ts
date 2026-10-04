import { createRng } from '@engine/core/util.ts';
import type { Rng } from '@engine/core/util.ts';
import { RISE, SIDE_STEP } from '@engine/world/tiles.ts';
import { generateDungeon, tileWorldOf } from '@engine/world/dungeon.ts';
import type { TileMapData } from '@engine/world/dungeon.ts';
import { createFloors, unreachableFloorTiles } from '@engine/world/floors.ts';
import { COVER_H, PLAT_H } from '../data/level.ts';
import { BOSS_META } from '../data/bosses.ts';
import type { Biome } from '../data/types.ts';
import { ARENA_FROM, ARENA_PILLARS, addHazards } from './levelGen.ts';
import type { GeneratedLevel } from './levelGen.ts';
// One depth is one building: FLOORS floors stacked FLOOR_H apart, with the boss room (a hall with a single door,
// engine/src/world/dungeon.ts) on the lowest floor. Floor 0 is the top, where the run starts; the floors below are
// reached by a stairwell and a lift between every two neighbouring floors, each at the same place on both floors, so
// the building is one connected space. The whole building is generated at once from one seed, so the same seed gives
// the same building again (resuming a suspended run rebuilds it).
// No three.js and no tile world here: only the plans. world/level.ts draws them and makes one floor the active one.
//
// A stairwell is a straight strip of STRIP tiles: E (the foot), RAMPS ramp tiles, then the landing L1 and L2.
//   on the lower floor the whole strip is floor: E on the ground, the ramps rising to FLOOR_H, L1 and L2 at FLOOR_H
//   on the upper floor only L1 and L2 are floor (on its ground, the same height in the world); the rest is open
// The player is on the lower floor's tile world up to L1 and on the upper floor's from L2 on (flow/events.ts).
// A lift is one tile S that is floor on both floors; standing on it rides to the other one.
// ---- tuning numbers used only here ----
export const FLOORS = 3; // floors of a building
export const FLOOR_H = 8; // from the ground of one floor to the ground of the next (m)
const RAMPS = FLOOR_H / RISE; // ramp tiles of a stairwell
export const STRIP = RAMPS + 3; // tiles of a stairwell: E, the ramps, L1, L2
const BOSS_HALL = 12; // side of the boss room (tiles), the same as the floor of a boss arena
const LAST_FLOOR_ROOMS: [number, number] = [2, 3]; // ordinary rooms on the lowest floor, next to the boss room
const PLACE_TRIES = 600; // random places tried for one stairwell or lift
const SEED_TRIES = 30; // seeds tried until a building has room for its stairwells and every floor is reached
const SEED_STEP = 7919; // added to the seed for the next try
const DOOR_PAIR_REACH = 2; // of two doors this many tiles apart or closer along a corridor, only one stays

// a way between two neighbouring floors. upper is the floor above (the smaller number); the one below is upper + 1
export interface BuildingLink {
  kind: 'stairs' | 'elevator';
  upper: number;
  a: number; // the tile where the player stands on the upper floor after crossing (stairs: L2, lift: S)
  b: number; // ... on the lower floor (stairs: L1, lift: S)
  strip: number[]; // stairs: E, the ramps, L1, L2 in order; lift: [S]
}
// one floor of the building, as generated
export interface FloorPlan {
  gen: GeneratedLevel; // maps, rooms and hazard floors; startIdx is the start room on floor 0 and -1 on the others
  hall: { room: number; door: number } | null; // the boss room and its door (lowest floor only)
  seen: Uint8Array; // per tile: shown on the map; kept while the building lives, so a floor stays explored
  // how the floor is drawn where it meets the floors above and below (all per tile, 1 = yes)
  voids: Uint8Array; // open down to the stairwell of the floor below: solid in the tile world, but no wall is drawn
  noFloor: Uint8Array; // a floor tile with no floor drawn (a landing the lower floor draws, a lift's shaft)
  noCeil: Uint8Array; // no ceiling: the stairwell and the lift's shaft go up through it
  shaft: Uint8Array; // round a stairwell or shaft going up: the gap between this ceiling and the next floor is walled
  shaftWall: Uint8Array; // round the open part of a stairwell coming up from below: a wall is drawn here
}
export interface Building {
  seed: number; // what makeBuilding was given
  biome: Biome;
  plans: FloorPlan[];
  links: BuildingLink[]; // floor pair by floor pair: the stairwell, then the lift
  lockdown: { floor: number; room: number } | null; // the room where the lockdown happens (none when no room fits)
}
// the building of the depth being played; replaced as a whole by setBuilding
export let building: Building | null = null;
export function setBuilding(b: Building | null) {
  building = b;
}

// the door tiles round a room, and whether every opening of the room is one of them (a room that can be shut)
export function roomDoors(d: GeneratedLevel, room: number): { doors: number[]; closable: boolean } {
  const r = d.rooms[room]!,
    M = d.maps,
    doors: number[] = [];
  let closable = true;
  for (let j = r.y - 1; j <= r.y + r.h; j++)
    for (let i = r.x - 1; i <= r.x + r.w; i++) {
      const inside = i >= r.x && i < r.x + r.w && j >= r.y && j < r.y + r.h,
        k = j * d.W + i;
      if (inside || i < 0 || j < 0 || i >= d.W || j >= d.H || M.grid[k] !== 1) continue;
      if (M.door?.[k]) doors.push(k);
      else closable = false;
    }
  return { doors, closable: closable && doors.length > 0 };
}

// Two rooms joined by a very short corridor would have a door at each end of it, one right after the other. Of such
// a pair the second goes (the boss room's door always stays), so there is one door to wait for, not two
function thinDoorPairs(d: TileMapData) {
  const door = d.maps.door;
  if (!door) return;
  const keep = d.hall?.door ?? -1;
  for (let k = 0; k < door.length; k++)
    for (const step of [1, d.W])
      for (let n = 1; n <= DOOR_PAIR_REACH && door[k]; n++) {
        const other = k + step * n;
        if (!door[other]) continue;
        door[other === keep ? k : other] = 0;
      }
}

// ---- stairwells and lifts ----
// the 8 tiles round tile k and k itself (the map's outer ring is never asked for)
function around(W: number, k: number): number[] {
  const out: number[] = [];
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) out.push(k + dj * W + di);
  return out;
}
// a floor tile with nothing built on it: not a door, a ramp, a deck or cover
const plain = (d: TileMapData, k: number): boolean =>
  d.maps.grid[k] === 1 && d.maps.hgt[k] === 0 && d.maps.ramp[k]! < 0 && !d.maps.cover[k] && !d.maps.door?.[k];
// A 1-wide corridor from tile `from` to the nearest plain floor tile, breadth first over the inside of the map. It
// goes through wall and over plain floor, never over a tile in `keepOut` or one with something built on it (so it
// cannot run into the side of a walkway or through a door). Carves the wall tiles on the way; false when no way
function carveCorridorFrom(d: TileMapData, from: number, keepOut: Uint8Array): boolean {
  const { W, H, maps: M } = d,
    prev = new Int32Array(W * H).fill(-1),
    queue = [from];
  prev[from] = from;
  for (let n = 0; n < queue.length; n++) {
    const c = queue[n]!;
    if (c !== from && plain(d, c)) {
      for (let k = prev[c]!; ; k = prev[k]!) {
        M.grid[k] = 1;
        if (k === from) return true;
      }
    }
    for (const [a, b] of SIDE_STEP) {
      const i = (c % W) + a,
        j = Math.floor(c / W) + b,
        k = j * W + i;
      if (i < 1 || j < 1 || i > W - 2 || j > H - 2 || prev[k]! >= 0 || keepOut[k]) continue;
      if (M.grid[k] === 1 && !plain(d, k)) continue;
      prev[k] = c;
      queue.push(k);
    }
  }
  return false;
}
// is every one of the tiles, with the 8 round it, wall on both floors and inside the map
function allSolid(lo: TileMapData, up: TileMapData, tiles: number[]): boolean {
  const { W, H } = lo;
  return tiles.every(k => {
    const i = k % W,
      j = Math.floor(k / W);
    if (i < 2 || j < 2 || i > W - 3 || j > H - 3) return false;
    return around(W, k).every(t => !lo.maps.grid[t] && !up.maps.grid[t]);
  });
}
// the tiles and the 8 round each are kept clear of the corridors made later (the hall and the stairwells)
function markAround(keepOut: Uint8Array, W: number, tiles: number[]) {
  tiles.forEach(k =>
    around(W, k).forEach(t => {
      keepOut[t] = 1;
    }),
  );
}

// Puts a stairwell between the floor `up` and the one below it: a random strip that is wall (with wall round it) on
// both floors, then a corridor from its foot on the lower floor and one from its landing on the upper floor.
// Draws up to PLACE_TRIES places (a tile and a direction each). Returns null when no place fits or a corridor finds
// no way
function addStairs(maps: TileMapData[], keepOut: Uint8Array[], up: number, rng: Rng): BuildingLink | null {
  const U = maps[up]!,
    L = maps[up + 1]!,
    W = U.W,
    outU = keepOut[up]!,
    outL = keepOut[up + 1]!;
  for (let t = 0; t < PLACE_TRIES; t++) {
    const baseI = rng.randi(2, W - 3),
      baseJ = rng.randi(2, U.H - 3),
      sd = rng.randi(0, SIDE_STEP.length - 1),
      [di, dj] = SIDE_STEP[sd]!,
      endI = baseI + di * STRIP, // one past the landing: where the upper floor's corridor starts
      endJ = baseJ + dj * STRIP;
    if (endI < 2 || endJ < 2 || endI > W - 3 || endJ > U.H - 3) continue;
    const step = dj * W + di,
      strip = Array.from({ length: STRIP }, (_, n) => baseJ * W + baseI + step * n),
      foot = strip[0]! - step, // the lower floor's corridor starts here
      top = strip[STRIP - 1]! + step;
    if (!allSolid(L, U, [...strip, foot, top]) || [...strip, foot, top].some(k => outU[k] || outL[k])) continue;
    // the lower floor: the whole strip, rising
    strip.forEach((k, n) => {
      L.maps.grid[k] = 1;
      if (n >= 1 && n <= RAMPS) {
        L.maps.ramp[k] = sd;
        L.maps.hgt[k] = (n - 1) * RISE;
      } else if (n > RAMPS) L.maps.hgt[k] = FLOOR_H;
    });
    // the upper floor: the landing
    U.maps.grid[strip[STRIP - 2]!] = 1;
    U.maps.grid[strip[STRIP - 1]!] = 1;
    markAround(outU, W, strip);
    markAround(outL, W, strip);
    outU[top] = 0;
    outL[foot] = 0;
    if (!carveCorridorFrom(L, foot, outL) || !carveCorridorFrom(U, top, outU)) return null;
    outU[top] = 1;
    outL[foot] = 1;
    return { kind: 'stairs', upper: up, a: strip[STRIP - 1]!, b: strip[STRIP - 2]!, strip };
  }
  return null;
}
// Puts a lift between the floor `up` and the one below it: a random tile that is wall (with wall round it) on both
// floors, then a corridor from it on each floor. Returns null when no place fits or a corridor finds no way
function addLift(maps: TileMapData[], keepOut: Uint8Array[], up: number, rng: Rng): BuildingLink | null {
  const U = maps[up]!,
    L = maps[up + 1]!,
    W = U.W;
  for (let t = 0; t < PLACE_TRIES; t++) {
    const s = rng.randi(2, W - 3) + rng.randi(2, U.H - 3) * W;
    if (!allSolid(L, U, [s]) || around(W, s).some(k => keepOut[up]![k] || keepOut[up + 1]![k])) continue;
    for (const n of [up, up + 1]) {
      if (!carveCorridorFrom(maps[n]!, s, keepOut[n]!)) return null;
      keepOut[n]![s] = 1;
    }
    return { kind: 'elevator', upper: up, a: s, b: s, strip: [s] };
  }
  return null;
}

// is every floor tile of the building walked to from the start room, taking the stairs and lifts (cover tiles aside)
function allReached(maps: TileMapData[], links: BuildingLink[], startIdx: number): boolean {
  const W = maps[0]!.W,
    spot = (floor: number, k: number) => ({ floor, i: k % W, j: Math.floor(k / W) }),
    top = (l: BuildingLink) => l.strip[l.strip.length - 1]!, // L2 (or S): a floor tile on both floors at one height
    f = createFloors(
      maps.map(tileWorldOf),
      maps.map((_, n) => -n * FLOOR_H),
      links.map(l => ({ kind: l.kind, a: spot(l.upper, top(l)), b: spot(l.upper + 1, top(l)) })),
    ),
    r = maps[0]!.rooms[startIdx]!,
    from = { floor: 0, i: Math.floor(r.x + r.w / 2), j: Math.floor(r.y + r.h / 2) };
  return unreachableFloorTiles(f, from).every(t => maps[t.floor]!.maps.cover[t.j * W + t.i]);
}

// no hazard floor on the tiles or right next to them
function clearHazardsAround(plan: FloorPlan, tiles: number[]) {
  tiles.forEach(k =>
    around(plan.gen.W, k).forEach(t => {
      plan.gen.hazard[t] = 0;
    }),
  );
}
// the tiles of a room
export function roomTiles(d: { W: number; rooms: TileMapData['rooms'] }, room: number): number[] {
  const r = d.rooms[room]!,
    out: number[] = [];
  for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) out.push(j * d.W + i);
  return out;
}

// One try at a building from this exact seed. The random numbers are drawn in this order: the floors, then floor pair
// by floor pair the stairwell and the lift, floor by floor the hazard floors, the start room, the lockdown room.
// Returns null when a stairwell or lift finds no place, or a floor tile ends up cut off
function tryBuilding(biome: Biome, bossKind: string, seed: number): Building | null {
  const rng = createRng(seed);
  const base = { ...biome.gen, deckH: PLAT_H, coverH: COVER_H, doors: true };
  const last = {
    ...base,
    countMin: LAST_FLOOR_ROOMS[0],
    countMax: LAST_FLOOR_ROOMS[1],
    hall: { w: BOSS_HALL, h: BOSS_HALL },
  };
  const maps = Array.from({ length: FLOORS }, (_, n) => generateDungeon(n === FLOORS - 1 ? last : base, rng));
  maps.forEach(thinDoorPairs);
  const W = maps[0]!.W,
    size = W * maps[0]!.H,
    keepOut = maps.map(d => {
      const out = new Uint8Array(size);
      if (d.hall) markAround(out, W, roomTiles(d, d.hall.room));
      return out;
    }),
    links: BuildingLink[] = [];
  for (let up = 0; up + 1 < FLOORS; up++) {
    const stairs = addStairs(maps, keepOut, up, rng),
      lift = stairs && addLift(maps, keepOut, up, rng);
    if (!stairs || !lift) return null;
    links.push(stairs, lift);
  }
  const plans: FloorPlan[] = maps.map(d => {
    const hazard = new Uint8Array(size);
    if (biome.gen.hazard) addHazards(d, hazard, biome.gen.hazard.count, rng);
    return {
      gen: { W: d.W, H: d.H, maps: d.maps, hazard, rooms: d.rooms, startIdx: -1 },
      hall: d.hall ?? null,
      seen: new Uint8Array(size),
      voids: new Uint8Array(size),
      noFloor: new Uint8Array(size),
      noCeil: new Uint8Array(size),
      shaft: new Uint8Array(size),
      shaftWall: new Uint8Array(size),
    };
  });
  // how each floor is drawn round its stairwells and lifts, and no hazard floor there
  for (const l of links) {
    const up = plans[l.upper]!,
      lo = plans[l.upper + 1]!;
    clearHazardsAround(up, l.strip);
    clearHazardsAround(lo, l.strip);
    for (const k of l.strip) {
      lo.noCeil[k] = 1;
      for (const t of around(W, k)) lo.shaft[t] = 1;
    }
    up.noFloor[l.a] = 1;
    if (l.kind === 'elevator') continue;
    up.noFloor[l.b] = 1;
    const open = l.strip.slice(0, STRIP - 2); // E and the ramps: nothing of the upper floor stands here
    for (const k of open) up.voids[k] = 1;
    for (const k of open) for (const t of around(W, k)) if (!up.gen.maps.grid[t] && !up.voids[t]) up.shaftWall[t] = 1;
  }
  // the start room, on the top floor: no hazard floor in it or its doorways (as in a Sector Dive area)
  const top = plans[0]!;
  top.gen.startIdx = rng.randi(0, top.gen.rooms.length - 1);
  clearHazardsAround(top, roomTiles(top.gen, top.gen.startIdx));
  plans.forEach(p => {
    // nor on the doors, or in the boss room
    p.gen.maps.door?.forEach((v, k) => {
      if (v) p.gen.hazard[k] = 0;
    });
    if (!p.hall) return;
    const hall = p.gen.rooms[p.hall.room]!;
    clearHazardsAround(p, roomTiles(p.gen, p.hall.room));
    // the boss's pillars, at the same places as in a boss arena
    if (BOSS_META[bossKind]?.pillars)
      for (const [pi, pj] of ARENA_PILLARS)
        p.gen.maps.grid[(hall.y + pj - ARENA_FROM) * W + hall.x + pi - ARENA_FROM] = 0;
  });
  if (!allReached(maps, links, top.gen.startIdx)) return null;
  // the lockdown room: one that can be shut (every opening is a door), with enemies in it
  const fits: { floor: number; room: number }[] = [];
  plans.forEach((p, floor) =>
    p.gen.rooms.forEach((_, room) => {
      if (room !== p.gen.startIdx && room !== p.hall?.room && roomDoors(p.gen, room).closable)
        fits.push({ floor, room });
    }),
  );
  return { seed, biome, plans, links, lockdown: fits.length ? rng.pick(fits) : null };
}
// The same seed, sector and boss give the same building. A seed whose floors leave no room for a stairwell or lift is
// passed over for the next one (seed + SEED_STEP, ...), the same way every time; the building keeps the seed it was
// asked for. Throws when SEED_TRIES seeds in a row fail
export function makeBuilding(biome: Biome, bossKind: string, seed: number): Building {
  for (let n = 0; n < SEED_TRIES; n++) {
    const b = tryBuilding(biome, bossKind, (seed + n * SEED_STEP) >>> 0);
    if (b) return { ...b, seed };
  }
  throw new Error(`makeBuilding: no building for ${biome.code} from seed ${seed}`);
}
