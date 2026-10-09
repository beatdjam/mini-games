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
// One depth is one building: 3 to 5 floors stacked FLOOR_H apart, with the boss room (a hall with a single door,
// engine/src/world/dungeon.ts) on the lowest floor. Floor 0 is the top, where the run starts. The floors are visited
// in the order of the building's route (it starts on the top floor and ends on the lowest, but may go down two floors
// and back up one in between); each step of the route is one stairwell or one lift, at the same place on the floors
// it joins, so the building is one connected space. Enemies get stronger along the route, not floor by floor. The whole building is generated at once from one seed, so the same seed gives
// the same building again (resuming a suspended run rebuilds it).
// No three.js and no tile world here: only the plans. world/level.ts draws them and makes one floor the active one.
//
// A stairwell is a straight strip of STRIP tiles: E (the foot), RAMPS ramp tiles, then the landing L1 and L2.
//   on the lower floor the whole strip is floor: E on the ground, the ramps rising to FLOOR_H, L1 and L2 at FLOOR_H
//   on the upper floor only L1 and L2 are floor (on its ground, the same height in the world); the rest is open
// The player is on the lower floor's tile world up to L1 and on the upper floor's from L2 on (flow/events.ts).
// A lift is one tile S that is floor on both floors; standing on it rides to the other one.
// ---- tuning numbers used only here ----
export const FLOORS_RANGE: [number, number] = [3, 5]; // floors of a building
// ordinary rooms per floor (min, max) by the number of floors, so that a building has about as many rooms with
// enemies as a Sector Dive depth (about 13.6 on average) however many floors it has. null = the sector's own numbers
const ROOMS_BY_FLOORS: Record<number, [number, number] | null> = { 3: null, 4: [4, 4], 5: [3, 3] };
const LIFT_REACH = 3; // a lift goes at most this many floors
const STAIRS_CHANCE = 0.5; // a step of one floor is a stairwell this often, a lift otherwise
export const FLOOR_H = 8; // from the ground of one floor to the ground of the next (m)
const RAMPS = FLOOR_H / RISE; // ramp tiles of a stairwell
export const STRIP = RAMPS + 3; // tiles of a stairwell: E, the ramps, L1, L2
const BOSS_HALL = 12; // side of the boss room (tiles), the same as the floor of a boss arena
const LAST_FLOOR_ROOMS: [number, number] = [3, 4]; // ordinary rooms on the lowest floor, next to the boss room
const PLACE_TRIES = 600; // random places tried for one stairwell or lift
const ROOMS_BETWEEN = 2; // rooms on the shortest way from where one stairwell or lift lets you off to the next
const LINK_TRIES = 24; // a stairwell or lift is put somewhere else this often to get them; see placeLink
const SEED_TRIES = 30; // seeds tried until a building has room for its stairwells and every floor is reached
const SEED_STEP = 7919; // added to the seed for the next try
// A courtyard: a well of COURT x COURT tiles open through several floors, with a gallery one tile wide round it on
// every floor it passes and its ground on the lowest of them. Looked into and up from, never crossed between floors
const COURT_SECTORS = ['CITY']; // the sectors whose buildings get one (when there is room)
const COURT = 3; // side of the open middle (tiles)
const COURT_SIDE = COURT + 4; // ... with the gallery and the wall round that: this square is wall on every floor it takes
const COURT_TRIES = 12; // places tried
const DOOR_PAIR_REACH = 2; // of two doors this many tiles apart or closer along a corridor, only one stays

// A way between two floors: a stairwell joins neighbouring floors, a lift may pass one floor on its way. upper is the
// floor above (the smaller number), lower the one below
export interface BuildingLink {
  kind: 'stairs' | 'elevator';
  upper: number;
  lower: number;
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
  // the courtyard's open middle on this floor (null = none here): `top` has the skylight over it, `ground` is the
  // floor one walks on (elsewhere it is a hole with a rail round it)
  court: { tiles: number[]; top: boolean; ground: boolean } | null;
}
// the courtyard of a building: the floors it is open through (upper = the top one, with the skylight; lower = the
// one its ground is on) and the tiles of its open middle (the same on every floor)
export interface Court {
  upper: number;
  lower: number;
  tiles: number[];
}
export interface Building {
  seed: number; // what makeBuilding was given
  biome: Biome;
  plans: FloorPlan[];
  route: number[]; // the floors in the order they are visited: route[0] = 0 (the top), the last = the lowest floor
  links: BuildingLink[]; // step by step along the route: links[n] joins route[n] and route[n + 1]
  lockdown: { floor: number; room: number } | null; // the room where the lockdown happens (none when no room fits)
  court: Court | null; // the courtyard (none in most sectors, or when no place fits)
}
// the building of the depth being played; replaced as a whole by setBuilding
export let building: Building | null = null;
export function setBuilding(b: Building | null) {
  building = b;
}

// The explored map of every floor as text, for the checkpoint: one bit per tile, 8 tiles to a character code, base64.
// A resumed run gets its map back with unpackSeen (the building is rebuilt from its seed, the map is not)
export function packSeen(b: Building): string[] {
  return b.plans.map(p => {
    let text = '';
    for (let k = 0; k < p.seen.length; k += 8) {
      let byte = 0;
      for (let n = 0; n < 8; n++) if (p.seen[k + n]) byte |= 1 << n;
      text += String.fromCharCode(byte);
    }
    return btoa(text);
  });
}
// puts a packed map back on the building's floors; a floor without one (or with a broken one) stays unexplored
export function unpackSeen(b: Building, packed: string[] | undefined) {
  b.plans.forEach((p, floor) => {
    let text = '';
    try {
      text = atob(packed?.[floor] ?? '');
    } catch (err) {
      return;
    }
    for (let k = 0; k < p.seen.length; k++) p.seen[k] = (text.charCodeAt(k >> 3) >> (k & 7)) & 1 ? 1 : 0;
  });
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
// a pair the second goes (the boss room's door always stays), so there is one door to wait for, not two. In a corridor
// 2 wide a door is two tiles side by side: they are one door, and go or stay together
function thinDoorPairs(d: TileMapData) {
  const door = d.maps.door;
  if (!door) return;
  const keep = d.hall?.door ?? -1,
    // the step along the corridor a door stands across: the one with floor that is not door on it
    along = (k: number): number => [1, d.W].find(s => [k - s, k + s].some(t => d.maps.grid[t] === 1 && !door[t])) ?? 1,
    remove = (k: number) => {
      const across = along(k) === 1 ? d.W : 1;
      for (const t of [k, k - across, k + across]) door[t] = 0;
    };
  for (let k = 0; k < door.length; k++) {
    if (!door[k]) continue;
    const step = along(k);
    for (let n = 1; n <= DOOR_PAIR_REACH && door[k]; n++) {
      const other = k + step * n;
      if (door[other]) remove(other === keep ? k : other);
    }
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

// A route through `floors` floors: from the top floor to the lowest, every floor once, never more than LIFT_REACH
// floors at a step (so 3 floors have one route, 4 have two, 5 have six: every order of the three floors between).
// Draws one random number
export function makeRoute(floors: number, rng: Rng): number[] {
  const between = Array.from({ length: floors - 2 }, (_, n) => n + 1),
    routes: number[][] = [];
  // every order of the floors between the top and the lowest, kept when no step is too long
  const walk = (route: number[], left: number[]) => {
    const at = route[route.length - 1]!;
    if (!left.length) {
      if (floors - 1 - at <= LIFT_REACH) routes.push([...route, floors - 1]);
      return;
    }
    for (const f of left)
      if (Math.abs(f - at) <= LIFT_REACH)
        walk(
          [...route, f],
          left.filter(g => g !== f),
        );
  };
  walk([0], between);
  return rng.pick(routes);
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
    return { kind: 'stairs', upper: up, lower: up + 1, a: strip[STRIP - 1]!, b: strip[STRIP - 2]!, strip };
  }
  return null;
}
// Puts a lift between the floors `up` and `lo` (lo below up, at most LIFT_REACH floors apart): a random tile that is
// wall (with wall round it) on those floors and every floor between, then a corridor from it on the two floors it
// stops at. On a floor it only passes, the tile stays wall. Returns null when no place fits or a corridor finds no way
function addLift(maps: TileMapData[], keepOut: Uint8Array[], up: number, lo: number, rng: Rng): BuildingLink | null {
  const U = maps[up]!,
    W = U.W,
    span = Array.from({ length: lo - up + 1 }, (_, n) => up + n);
  for (let t = 0; t < PLACE_TRIES; t++) {
    const s = rng.randi(2, W - 3) + rng.randi(2, U.H - 3) * W,
      free = span.every(
        n => around(W, s).every(k => !maps[n]!.maps.grid[k] && !keepOut[n]![k]) && allSolid(maps[n]!, U, [s]),
      );
    if (!free) continue;
    for (const n of [up, lo]) {
      if (!carveCorridorFrom(maps[n]!, s, keepOut[n]!)) return null;
      keepOut[n]![s] = 1;
    }
    for (const n of span.slice(1, -1)) markAround(keepOut[n]!, W, [s]);
    return { kind: 'elevator', upper: up, lower: lo, a: s, b: s, strip: [s] };
  }
  return null;
}

// The rooms the shortest way from tile `from` to tile `to` goes through (over floor tiles; heights and doors aside),
// the room `skip` not counted
export function roomsOnWay(d: TileMapData, from: number, to: number, skip: number): number {
  const { W, H, maps: M, rooms } = d,
    prev = new Int32Array(W * H).fill(-1),
    queue = [from];
  prev[from] = from;
  for (let n = 0; n < queue.length && prev[to]! < 0; n++) {
    const c = queue[n]!;
    for (const [a, b] of SIDE_STEP) {
      const i = (c % W) + a,
        j = Math.floor(c / W) + b,
        k = j * W + i;
      if (i < 0 || j < 0 || i >= W || j >= H || prev[k]! >= 0 || M.grid[k] !== 1) continue;
      prev[k] = c;
      queue.push(k);
    }
  }
  if (prev[to]! < 0) return 0;
  const on = new Set<number>();
  for (let k = to; k !== from; k = prev[k]!) {
    const i = k % W,
      j = Math.floor(k / W),
      room = rooms.findIndex(r => i >= r.x && i < r.x + r.w && j >= r.y && j < r.y + r.h);
    if (room >= 0 && room !== skip) on.add(room);
  }
  return on.size;
}
// The stairwell or lift of one step of the route, between the floors `up` and `lo`, with rooms between it and
// `from`: the tile on the floor `floor` where the player comes from (where the link before lets them off, or the
// middle of the start room), `skip` the room there that does not count (the start room, or -1). A place whose
// shortest way from there goes through fewer than ROOMS_BETWEEN rooms (or all the floor has, when fewer) is taken
// back and another drawn; after two thirds of LINK_TRIES one room is enough, and the last try stands as it is.
// Without this, half the links stood one room or none away, and a floor was over before it began
function placeLink(
  maps: TileMapData[],
  keepOut: Uint8Array[],
  stairs: boolean,
  up: number,
  lo: number,
  at: { floor: number; from: number; skip: number },
  rng: Rng,
): BuildingLink | null {
  const d = maps[at.floor]!,
    most = d.rooms.length - (at.skip >= 0 ? 1 : 0);
  for (let t = 0; ; t++) {
    const kept = maps.map((m, n) => ({
      grid: m.maps.grid.slice(),
      ramp: m.maps.ramp.slice(),
      hgt: m.maps.hgt.slice(),
      out: keepOut[n]!.slice(),
    }));
    const link = stairs ? addStairs(maps, keepOut, up, rng) : addLift(maps, keepOut, up, lo, rng);
    if (!link || t === LINK_TRIES - 1) return link;
    const want = Math.min(most, t < (LINK_TRIES * 2) / 3 ? ROOMS_BETWEEN : 1);
    if (roomsOnWay(d, at.from, at.floor === link.upper ? link.a : link.b, at.skip) >= want) return link;
    kept.forEach((k, n) => {
      maps[n]!.maps.grid.set(k.grid);
      maps[n]!.maps.ramp.set(k.ramp);
      maps[n]!.maps.hgt.set(k.hgt);
      keepOut[n]!.set(k.out);
    });
  }
}

// Puts a courtyard where a square of COURT_SIDE tiles is wall on as many floors next to each other as possible (two
// at least; never the lowest floor, whose boss room stands higher than a floor). On each of them a gallery is carved
// round the open middle, with a corridor to the rest of the floor; on the lowest the middle is floor too. Returns
// null (and leaves the maps as they were) when no place fits
function addCourt(maps: TileMapData[], keepOut: Uint8Array[], rng: Rng): Court | null {
  const { W, H } = maps[0]!,
    last = maps.length - 2, // the lowest floor a courtyard may reach
    free = (f: number, i: number, j: number): boolean => {
      for (let b = 0; b < COURT_SIDE; b++)
        for (let a = 0; a < COURT_SIDE; a++) {
          const k = (j + b) * W + i + a;
          if (maps[f]!.maps.grid[k] || keepOut[f]![k]) return false;
        }
      return true;
    };
  // every place with the run of floors it is free on, the longest runs first
  let best = 2;
  let places: { i: number; j: number; upper: number; lower: number }[] = [];
  for (let j = 1; j + COURT_SIDE < H; j++)
    for (let i = 1; i + COURT_SIDE < W; i++)
      for (let upper = 0; upper + best - 1 <= last; upper++) {
        let lower = upper;
        while (lower <= last && free(lower, i, j)) lower++;
        const n = lower - upper;
        if (n < best) continue;
        if (n > best) {
          best = n;
          places = [];
        }
        places.push({ i, j, upper, lower: lower - 1 });
      }
  for (let t = 0; t < COURT_TRIES && places.length; t++) {
    const at = places.splice(rng.randi(0, places.length - 1), 1)[0]!,
      kept = maps.map((m, n) => ({ grid: m.maps.grid.slice(), out: keepOut[n]!.slice() })),
      tile = (a: number, b: number) => (at.j + b) * W + at.i + a,
      tiles: number[] = [];
    for (let b = 2; b < 2 + COURT; b++) for (let a = 2; a < 2 + COURT; a++) tiles.push(tile(a, b));
    let ok = true;
    for (let f = at.upper; f <= at.lower && ok; f++) {
      const d = maps[f]!,
        out = keepOut[f]!;
      for (let b = 0; b < COURT_SIDE; b++)
        for (let a = 0; a < COURT_SIDE; a++) {
          const k = tile(a, b),
            ring = a >= 1 && b >= 1 && a <= COURT_SIDE - 2 && b <= COURT_SIDE - 2,
            open = tiles.includes(k);
          out[k] = 1;
          if (ring && (!open || f === at.lower)) d.maps.grid[k] = 1;
        }
      // the way in: from the middle of one side of the wall round the gallery, whichever finds a way
      const mid = (COURT_SIDE - 1) / 2,
        gates = [tile(mid, 0), tile(mid, COURT_SIDE - 1), tile(0, mid), tile(COURT_SIDE - 1, mid)];
      ok = false;
      for (let n = rng.randi(0, 3), tries = 0; tries < 4 && !ok; n = (n + 1) % 4, tries++) {
        const gate = gates[n]!;
        out[gate] = 0;
        ok = carveCorridorFrom(d, gate, out);
        out[gate] = 1;
      }
    }
    if (ok) return { upper: at.upper, lower: at.lower, tiles };
    kept.forEach((k, n) => {
      maps[n]!.maps.grid.set(k.grid);
      keepOut[n]!.set(k.out);
    });
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
      links.map(l => ({ kind: l.kind, a: spot(l.upper, top(l)), b: spot(l.lower, top(l)) })),
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

// One try at a building from this exact seed. The random numbers are drawn in this order: the number of floors, the
// route, the floors, the start room, then step by step along the route its stairwell or lift, floor by floor the
// hazard floors, the lockdown room.
// Returns null when a stairwell or lift finds no place, or a floor tile ends up cut off
function tryBuilding(biome: Biome, bossKind: string, seed: number): Building | null {
  const rng = createRng(seed);
  const FLOORS = rng.randi(FLOORS_RANGE[0], FLOORS_RANGE[1]),
    route = makeRoute(FLOORS, rng),
    rooms = ROOMS_BY_FLOORS[FLOORS];
  const base = {
    ...biome.gen,
    ...(rooms ? { countMin: rooms[0], countMax: rooms[1] } : {}),
    deckH: PLAT_H,
    coverH: COVER_H,
    doors: true,
  };
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
      // nor past a door: a corridor carved beside a door tile would open a way round it, and the door would stand
      // along that corridor instead of across its own
      const doors: number[] = [];
      d.maps.door?.forEach((v, k) => {
        if (v) doors.push(k);
      });
      markAround(out, W, doors);
      return out;
    }),
    links: BuildingLink[] = [],
    // the start room, on the top floor
    startIdx = rng.randi(0, maps[0]!.rooms.length - 1),
    startRoom = maps[0]!.rooms[startIdx]!;
  for (let n = 0; n + 1 < route.length; n++) {
    const floor = route[n]!,
      up = Math.min(floor, route[n + 1]!),
      lo = Math.max(floor, route[n + 1]!),
      stairs = lo - up === 1 && rng.next() < STAIRS_CHANCE,
      before = links[n - 1],
      from = before
        ? floor === before.upper
          ? before.a
          : before.b
        : Math.floor(startRoom.y + startRoom.h / 2) * W + Math.floor(startRoom.x + startRoom.w / 2),
      link = placeLink(maps, keepOut, stairs, up, lo, { floor, from, skip: before ? -1 : startIdx }, rng);
    if (!link) return null;
    links.push(link);
  }
  // (after the stairwells and lifts, which need their places more; only in the sectors that have one, so the other
  // sectors' buildings draw the same random numbers as before)
  const court = COURT_SECTORS.includes(biome.code) ? addCourt(maps, keepOut, rng) : null;
  const plans: FloorPlan[] = maps.map((d, floor) => {
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
      court:
        court && floor >= court.upper && floor <= court.lower
          ? { tiles: court.tiles, top: floor === court.upper, ground: floor === court.lower }
          : null,
    };
  });
  // the courtyard: open upward on every floor but its top one, a hole on every floor but its lowest, and the gap to
  // the next floor walled over the galleries. No hazard floor in it
  if (court)
    for (let n = court.upper; n <= court.lower; n++) {
      const p = plans[n]!;
      for (const k of court.tiles) {
        if (n > court.upper) p.noCeil[k] = 1;
        if (n < court.lower) p.voids[k] = 1;
        for (const t of around(W, k)) {
          p.gen.hazard[t] = 0;
          if (n > court.upper && !court.tiles.includes(t)) p.shaft[t] = 1;
        }
      }
    }
  // how each floor is drawn round its stairwells and lifts, and no hazard floor there
  for (const l of links) {
    const up = plans[l.upper]!,
      lo = plans[l.lower]!;
    clearHazardsAround(up, l.strip);
    clearHazardsAround(lo, l.strip);
    // every floor below the top of the link is open upward there, with the gap to the next floor walled round it;
    // a floor the lift only passes also gets walls round the shaft (nothing else of it stands there)
    for (let n = l.upper + 1; n <= l.lower; n++) {
      const p = plans[n]!;
      for (const k of l.strip) {
        p.noCeil[k] = 1;
        for (const t of around(W, k)) {
          p.shaft[t] = 1;
          if (n < l.lower && t !== k) p.shaftWall[t] = 1;
        }
        if (n < l.lower) p.voids[k] = 1;
      }
    }
    up.noFloor[l.a] = 1;
    if (l.kind === 'elevator') continue;
    up.noFloor[l.b] = 1;
    const open = l.strip.slice(0, STRIP - 2); // E and the ramps: nothing of the upper floor stands here
    for (const k of open) up.voids[k] = 1;
    for (const k of open) for (const t of around(W, k)) if (!up.gen.maps.grid[t] && !up.voids[t]) up.shaftWall[t] = 1;
  }
  // the start room: no hazard floor in it or its doorways (as in a Sector Dive area)
  const top = plans[0]!;
  top.gen.startIdx = startIdx;
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
  const lockdown = fits.length ? rng.pick(fits) : null;
  return { seed, biome, plans, route, links, lockdown, court };
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
