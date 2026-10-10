import type { Rng } from '../core/util.ts';
import { RISE, SIDE_STEP } from './tiles.ts';
import { tileWorldOf } from './dungeon.ts';
import type { TileMapData } from './dungeon.ts';
import { createFloors, unreachableFloorTiles } from './floors.ts';
// A building: floors made each on its own (generateDungeon), stacked floorH apart, joined by stairwells and lifts
// placed afterward where the floors are solid, with a corridor carved from each end to the nearest floor. Floor 0 is
// the top. The game decides how many floors, the order they are visited in (makeRoute gives one), what is on them and
// when a link is a stairwell or a lift; this places and checks the links and says how each floor is to be drawn round
// them. Random numbers come only from the Rng given, so the same seed gives the same building.
//
// A stairwell is a straight strip of stripOf(cfg) tiles: E (the foot), the ramps (floorH / RISE of them), then the
// landing L1 and L2.
//   on the lower floor the whole strip is floor: E on the ground, the ramps rising to floorH, L1 and L2 at floorH
//   on the upper floor only L1 and L2 are floor (on its ground, the same height in the world); the rest is open
// A lift is one tile S that is floor on both floors.
export interface StairwellConfig {
  floorH: number; // from the ground of one floor to the ground of the next (m; a whole number of RISE)
  liftReach: number; // a lift goes at most this many floors (makeRoute)
  placeTries: number; // random places tried for one stairwell or lift
  roomsBetween: number; // rooms on the shortest way from where one link lets you off to the next (placeLink)
  linkTries: number; // a link is put somewhere else this often to get them; see placeLink
}
export const STAIRWELL_DEFAULTS: StairwellConfig = {
  floorH: 8,
  liftReach: 3,
  placeTries: 600,
  roomsBetween: 2,
  linkTries: 24,
};
// tiles of a stairwell: E, the ramps, L1, L2
export const stripOf = (cfg: StairwellConfig = STAIRWELL_DEFAULTS): number => cfg.floorH / RISE + 3;
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
// the door tiles round a room, and whether every opening of the room is one of them (a room that can be shut)
export function roomDoors(d: TileMapData, room: number): { doors: number[]; closable: boolean } {
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
export function thinDoorPairs(d: TileMapData, reach = DOOR_PAIR_REACH) {
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
    for (let n = 1; n <= reach && door[k]; n++) {
      const other = k + step * n;
      if (door[other]) remove(other === keep ? k : other);
    }
  }
}

// the 8 tiles round tile k and k itself (the map's outer ring is never asked for)
export function around(W: number, k: number): number[] {
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
export function carveCorridorFrom(d: TileMapData, from: number, keepOut: Uint8Array): boolean {
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
export function allSolid(lo: TileMapData, up: TileMapData, tiles: number[]): boolean {
  const { W, H } = lo;
  return tiles.every(k => {
    const i = k % W,
      j = Math.floor(k / W);
    if (i < 2 || j < 2 || i > W - 3 || j > H - 3) return false;
    return around(W, k).every(t => !lo.maps.grid[t] && !up.maps.grid[t]);
  });
}
// the tiles and the 8 round each are kept clear of the corridors made later (the hall and the stairwells)
export function markAround(keepOut: Uint8Array, W: number, tiles: number[]) {
  tiles.forEach(k =>
    around(W, k).forEach(t => {
      keepOut[t] = 1;
    }),
  );
}

// A route through `floors` floors: from the top floor to the lowest, every floor once, never more than `liftReach`
// floors at a step (so 3 floors have one route, 4 have two, 5 have six: every order of the three floors between).
// Draws one random number
export function makeRoute(floors: number, rng: Rng, reach = STAIRWELL_DEFAULTS.liftReach): number[] {
  const between = Array.from({ length: floors - 2 }, (_, n) => n + 1),
    routes: number[][] = [];
  // every order of the floors between the top and the lowest, kept when no step is too long
  const walk = (route: number[], left: number[]) => {
    const at = route[route.length - 1]!;
    if (!left.length) {
      if (floors - 1 - at <= reach) routes.push([...route, floors - 1]);
      return;
    }
    for (const f of left)
      if (Math.abs(f - at) <= reach)
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
// Draws up to `placeTries` places (a tile and a direction each). Returns null when no place fits or a corridor finds
// no way
export function addStairs(
  maps: TileMapData[],
  keepOut: Uint8Array[],
  up: number,
  rng: Rng,
  cfg: StairwellConfig = STAIRWELL_DEFAULTS,
): BuildingLink | null {
  const STRIP = stripOf(cfg),
    RAMPS = STRIP - 3,
    U = maps[up]!,
    L = maps[up + 1]!,
    W = U.W,
    outU = keepOut[up]!,
    outL = keepOut[up + 1]!;
  for (let t = 0; t < cfg.placeTries; t++) {
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
      } else if (n > RAMPS) L.maps.hgt[k] = cfg.floorH;
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
// Puts a lift between the floors `up` and `lo` (lo below up, at most `liftReach` floors apart): a random tile that is
// wall (with wall round it) on those floors and every floor between, then a corridor from it on the two floors it
// stops at. On a floor it only passes, the tile stays wall. Returns null when no place fits or a corridor finds no way
export function addLift(
  maps: TileMapData[],
  keepOut: Uint8Array[],
  up: number,
  lo: number,
  rng: Rng,
  cfg: StairwellConfig = STAIRWELL_DEFAULTS,
): BuildingLink | null {
  const U = maps[up]!,
    W = U.W,
    span = Array.from({ length: lo - up + 1 }, (_, n) => up + n);
  for (let t = 0; t < cfg.placeTries; t++) {
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
// shortest way from there goes through fewer than `roomsBetween` rooms (or all the floor has, when fewer) is taken
// back and another drawn; after two thirds of `linkTries` one room is enough, and the last try stands as it is.
// Without this, half the links stood one room or none away, and a floor was over before it began
export function placeLink(
  maps: TileMapData[],
  keepOut: Uint8Array[],
  stairs: boolean,
  up: number,
  lo: number,
  at: { floor: number; from: number; skip: number },
  rng: Rng,
  cfg: StairwellConfig = STAIRWELL_DEFAULTS,
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
    const link = stairs ? addStairs(maps, keepOut, up, rng, cfg) : addLift(maps, keepOut, up, lo, rng, cfg);
    if (!link || t === cfg.linkTries - 1) return link;
    const want = Math.min(most, t < (cfg.linkTries * 2) / 3 ? cfg.roomsBetween : 1);
    if (roomsOnWay(d, at.from, at.floor === link.upper ? link.a : link.b, at.skip) >= want) return link;
    kept.forEach((k, n) => {
      maps[n]!.maps.grid.set(k.grid);
      maps[n]!.maps.ramp.set(k.ramp);
      maps[n]!.maps.hgt.set(k.hgt);
      keepOut[n]!.set(k.out);
    });
  }
}

// The places for a courtyard that needs a square of `side` tiles (see addCourt): where that square is
// wall on the most floors next to each other (two at least), and how many floors that is

// is every floor tile of the building walked to from the start room, taking the stairs and lifts (cover tiles aside)
export function allReached(
  maps: TileMapData[],
  links: BuildingLink[],
  startIdx: number,
  floorH = STAIRWELL_DEFAULTS.floorH,
): boolean {
  const W = maps[0]!.W,
    spot = (floor: number, k: number) => ({ floor, i: k % W, j: Math.floor(k / W) }),
    top = (l: BuildingLink) => l.strip[l.strip.length - 1]!, // L2 (or S): a floor tile on both floors at one height
    f = createFloors(
      maps.map(tileWorldOf),
      maps.map((_, n) => -n * floorH),
      links.map(l => ({ kind: l.kind, a: spot(l.upper, top(l)), b: spot(l.lower, top(l)) })),
    ),
    r = maps[0]!.rooms[startIdx]!,
    from = { floor: 0, i: Math.floor(r.x + r.w / 2), j: Math.floor(r.y + r.h / 2) };
  return unreachableFloorTiles(f, from).every(t => maps[t.floor]!.maps.cover[t.j * W + t.i]);
}
// the tiles of a room
export function roomTiles(d: { W: number; rooms: TileMapData['rooms'] }, room: number): number[] {
  const r = d.rooms[room]!,
    out: number[] = [];
  for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) out.push(j * d.W + i);
  return out;
}

// how a floor is drawn where it meets the floors above and below (all per tile, 1 = yes)
export interface FloorOpenings {
  voids: Uint8Array; // open down to the stairwell of the floor below: solid in the tile world, but no wall is drawn
  noFloor: Uint8Array; // a floor tile with no floor drawn (a landing the lower floor draws, a lift's shaft)
  noCeil: Uint8Array; // no ceiling: the stairwell and the lift's shaft go up through it
  shaft: Uint8Array; // round a stairwell or shaft going up: the gap between this ceiling and the next floor is walled
  shaftWall: Uint8Array; // round the open part of a stairwell coming up from below: a wall is drawn here
}
export const noOpenings = (size: number): FloorOpenings => ({
  voids: new Uint8Array(size),
  noFloor: new Uint8Array(size),
  noCeil: new Uint8Array(size),
  shaft: new Uint8Array(size),
  shaftWall: new Uint8Array(size),
});
// marks on each floor's openings (`floors`, floor by floor like `maps`) how it is drawn round the links
export function markLinkOpenings(
  floors: FloorOpenings[],
  maps: TileMapData[],
  links: BuildingLink[],
  cfg: StairwellConfig = STAIRWELL_DEFAULTS,
) {
  const W = maps[0]!.W,
    STRIP = stripOf(cfg);
  for (const l of links) {
    const up = floors[l.upper]!,
      upGrid = maps[l.upper]!.maps.grid;
    // every floor below the top of the link is open upward there, with the gap to the next floor walled round it;
    // a floor the lift only passes also gets walls round the shaft (nothing else of it stands there)
    for (let n = l.upper + 1; n <= l.lower; n++) {
      const p = floors[n]!;
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
    for (const k of open) for (const t of around(W, k)) if (!upGrid[t] && !up.voids[t]) up.shaftWall[t] = 1;
  }
}
