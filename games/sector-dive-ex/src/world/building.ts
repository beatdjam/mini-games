import { createRng } from '@engine/core/util.ts';
import type { Rng } from '@engine/core/util.ts';
import { generateDungeon } from '@engine/world/dungeon.ts';
import type { TileMapData } from '@engine/world/dungeon.ts';
import {
  allReached,
  around,
  carveCorridorFrom,
  makeRoute,
  markAround,
  markLinkOpenings,
  noOpenings,
  placeLink,
  roomDoors,
  roomTiles,
  stripOf,
  thinDoorPairs,
} from '@engine/world/stairwells.ts';
import type { BuildingLink, FloorOpenings, StairwellConfig } from '@engine/world/stairwells.ts';
// (what the game's other files and the tests take from here)
export { makeRoute, roomDoors, roomsOnWay, roomTiles } from '@engine/world/stairwells.ts';
export type { BuildingLink } from '@engine/world/stairwells.ts';
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
const BOSS_HALL = 12; // side of the boss room (tiles), the same as the floor of a boss arena
const LAST_FLOOR_ROOMS: [number, number] = [3, 4]; // ordinary rooms on the lowest floor, next to the boss room
const PLACE_TRIES = 600; // random places tried for one stairwell or lift
const ROOMS_BETWEEN = 2; // rooms on the shortest way from where one stairwell or lift lets you off to the next
const LINK_TRIES = 24; // a stairwell or lift is put somewhere else this often to get them; see placeLink
const SEED_TRIES = 30; // seeds tried until a building has room for its stairwells and every floor is reached
const SEED_STEP = 7919; // added to the seed for the next try
// the stairwells and lifts, placed by the engine (engine/src/world/stairwells.ts) with these numbers
const CFG: StairwellConfig = {
  floorH: FLOOR_H,
  liftReach: LIFT_REACH,
  placeTries: PLACE_TRIES,
  roomsBetween: ROOMS_BETWEEN,
  linkTries: LINK_TRIES,
};
export const STRIP = stripOf(CFG); // tiles of a stairwell: E, the ramps, L1, L2
// A courtyard, in two kinds.
// An atrium: a well COURT_ROOFED tiles a side, roofed with a skylight, open through several floors, with a gallery one
// tile wide round it on every floor it passes and its ground on the lowest of them. Looked into and up from. The
// gallery has two ways in: one on one side, the other on the far side or, where none is found there, round the corner;
// above the ground a bridge may join two on the far sides straight across the well (ATRIUM_BRIDGE_CHANCE). The ground
// and the gallery round it are a room.
// A yard: an outdoor well between the building's own outer walls (rows of windows, storey over storey; drawn by
// levelMesh.ts buildYardShell, not walked in), COURT_YARD tiles a side or COURT_YARD_WIDE where there is room. Each
// floor it passes looks out on it from a balcony: BALCONY tiles of the wall round it, floor instead of wall, with a
// rail. A floor's balcony has one of three shapes (YARD_SHAPES): the lookout alone; a walk, the whole of one side of
// the yard, joined to the floor at its ends (a corridor with the yard on one side); or a bridge from the lookout
// straight across the yard to a second one on the far side, which has its own way on into the floor. Neither kind of
// courtyard is crossed between floors
// which kinds a sector's buildings get (when there is room): what fits the place. A yard needs an outside to look at
// (the old downtown, the walled city's lightwells, the housing blocks of the ruins); an atrium is a hall inside (the
// furnace hall, a studio, a machine hall)
const COURT_KINDS: Record<string, 'both' | 'yard' | 'atrium'> = {
  CITY: 'both',
  KWLN: 'yard',
  RUIN: 'yard',
  FORGE: 'atrium',
  NOISE: 'atrium',
  DATA: 'atrium',
};
const COURT_ROOFED = 3,
  COURT_YARD = 5,
  COURT_YARD_WIDE = 7; // side of the open middle (tiles)
const COURT_OPEN_CHANCE = 0.5; // a courtyard is a yard this often
const BALCONY = 3; // tiles of a balcony along the yard
const ATRIUM_BRIDGE_CHANCE = 0.6; // a floor of an atrium that has a way in on both sides gets a bridge this often
export type YardShape = 'balcony' | 'walk' | 'bridge';
// the shapes of a yard's balconies, floor by floor, in this order from a random one on (so two floors next to each
// other never have the same)
const YARD_SHAPES: YardShape[] = ['bridge', 'walk', 'balcony'];
const COURT_TRIES = 12; // places tried

// one floor of the building, as generated
// (how the floor is drawn where it meets the floors above and below: FloorOpenings, engine/src/world/stairwells.ts)
export interface FloorPlan extends FloorOpenings {
  gen: GeneratedLevel; // maps, rooms and hazard floors; startIdx is the start room on floor 0 and -1 on the others
  hall: { room: number; door: number } | null; // the boss room and its door (lowest floor only)
  seen: Uint8Array; // per tile: shown on the map; kept while the building lives, so a floor stays explored
  // the courtyard's open middle on this floor (null = none here). An atrium (`open` false): `top` has the skylight
  // over it, `ground` is the floor one walks on (elsewhere it is a hole with a rail round it). A yard (`open`):
  // `balcony` are this floor's tiles that look out on it, `bridge` the tiles of the middle that are floor here
  court: {
    tiles: number[];
    top: boolean;
    ground: boolean;
    open: boolean;
    balcony: number[];
    bridge: number[];
  } | null;
}
// the courtyard of a building: the floors it is open through (upper = the top one, with the skylight; lower = the
// one its ground is on) and the tiles of its open middle (the same on every floor)
export interface Court {
  upper: number;
  lower: number;
  tiles: number[];
  open: boolean; // a yard, open to the sky; else an atrium, roofed
  balconies: number[][]; // a yard: per floor it passes (upper first), the tiles of that floor's balcony
  bridges: number[][]; // per floor it passes, the tiles of its middle that are a bridge there (mostly none)
}
// dev: every courtyard is of this kind (null = by the building's own dice), every balcony of a yard of this shape
let courtKind: boolean | null = null,
  yardShape: YardShape | null = null;
export function devCourtOpen(open: boolean | null, shape: YardShape | null = null) {
  courtKind = open;
  yardShape = shape;
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

// The places for a courtyard that needs a square of `side` tiles (see addCourt): where that square is
// wall on the most floors next to each other (two at least), and how many floors that is
function courtPlaces(maps: TileMapData[], keepOut: Uint8Array[], side: number) {
  const { W, H } = maps[0]!,
    last = maps.length - 2, // the lowest floor a courtyard may reach
    free = (f: number, i: number, j: number): boolean => {
      for (let b = 0; b < side; b++)
        for (let a = 0; a < side; a++) {
          const k = (j + b) * W + i + a;
          if (maps[f]!.maps.grid[k] || keepOut[f]![k]) return false;
        }
      return true;
    };
  let floors = 2;
  let places: { i: number; j: number; upper: number; lower: number }[] = [];
  for (let j = 1; j + side < H; j++)
    for (let i = 1; i + side < W; i++)
      for (let upper = 0; upper + floors - 1 <= last; upper++) {
        let lower = upper;
        while (lower <= last && free(lower, i, j)) lower++;
        const n = lower - upper;
        if (n < floors) continue;
        if (n > floors) {
          floors = n;
          places = [];
        }
        places.push({ i, j, upper, lower: lower - 1 });
      }
  return { places, floors: places.length ? floors : 0 };
}
// Puts a courtyard where a square of its side (the open middle, the gallery and the wall round that) is wall on as many floors next to each other as possible (two
// at least; never the lowest floor, whose boss room stands higher than a floor). On each of them a gallery is carved
// round the open middle, with a corridor to the rest of the floor; on the lowest the middle is floor too. Returns
// null (and leaves the maps as they were) when no place fits
function addCourt(
  maps: TileMapData[],
  keepOut: Uint8Array[],
  kinds: 'both' | 'yard' | 'atrium',
  wideToo: boolean,
  rng: Rng,
): Court | null {
  const W = maps[0]!.W,
    dice = rng.next() < COURT_OPEN_CHANCE,
    open = kinds === 'both' ? (courtKind ?? dice) : kinds === 'yard',
    // the square: an atrium's middle, its gallery and the wall round that; a yard's middle and the wall round it
    small = courtPlaces(maps, keepOut, open ? COURT_YARD + 2 : COURT_ROOFED + 4),
    wide = open && wideToo ? courtPlaces(maps, keepOut, COURT_YARD_WIDE + 2) : null,
    // (a yard takes the wider square unless that costs it more than one floor)
    roomy = !!wide && wide.floors >= 2 && wide.floors >= small.floors - 1,
    COURT = !open ? COURT_ROOFED : roomy ? COURT_YARD_WIDE : COURT_YARD,
    edge = open ? 1 : 2, // tiles between the square's side and the open middle
    SIDE = COURT + 2 * edge,
    places = roomy ? wide!.places : small.places,
    firstShape = rng.randi(0, YARD_SHAPES.length - 1);
  for (let t = 0; t < COURT_TRIES && places.length; t++) {
    const at = places.splice(rng.randi(0, places.length - 1), 1)[0]!,
      kept = maps.map((m, n) => ({ grid: m.maps.grid.slice(), out: keepOut[n]!.slice() })),
      tile = (a: number, b: number) => (at.j + b) * W + at.i + a,
      tiles: number[] = [],
      balconies: number[][] = [],
      bridges: number[][] = [];
    for (let b = edge; b < edge + COURT; b++) for (let a = edge; a < edge + COURT; a++) tiles.push(tile(a, b));
    let ok = true;
    for (let f = at.upper; f <= at.lower && ok; f++) {
      const d = maps[f]!,
        out = keepOut[f]!,
        mid = (SIDE - 1) / 2;
      for (let b = 0; b < SIDE; b++)
        for (let a = 0; a < SIDE; a++) {
          const k = tile(a, b),
            ring = a >= 1 && b >= 1 && a <= SIDE - 2 && b <= SIDE - 2;
          out[k] = 1;
          // an atrium: the gallery, and on the lowest floor the middle too
          if (!open && ring && (!tiles.includes(k) || f === at.lower)) d.maps.grid[k] = 1;
        }
      // the way in, from the middle of one side, whichever finds a way: an atrium's goes through the wall round the
      // gallery; a yard's starts at the balcony itself (BALCONY tiles of the wall, side by side). `into`: the step
      // from the gate into the yard
      const sides: { gate: number; along: number; into: number }[] = [
          { gate: tile(mid, 0), along: 1, into: W },
          { gate: tile(mid, SIDE - 1), along: 1, into: -W },
          { gate: tile(0, mid), along: W, into: 1 },
          { gate: tile(SIDE - 1, mid), along: W, into: -1 },
        ],
        shape = yardShape ?? YARD_SHAPES[(f - at.upper + firstShape) % YARD_SHAPES.length]!,
        way = (from: number): boolean => {
          out[from] = 0;
          const found = carveCorridorFrom(d, from, out);
          out[from] = 1;
          return found;
        },
        run = (middle: number, along: number, n: number) =>
          Array.from({ length: n }, (_, m) => middle + (m - (n - 1) / 2) * along);
      ok = false;
      for (let n = rng.randi(0, 3), tries = 0; tries < 4 && !ok; n = (n + 1) % 4, tries++) {
        const { gate, along, into } = sides[n]!;
        let balcony: number[],
          bridge: number[] = [];
        if (!open) {
          // An atrium: a second way in, so the gallery is passed through and not only come to: on the far side when
          // one is found, else on a side round the corner; and, on a floor where the middle is a hole, now and then a
          // bridge straight between the two on the far sides
          const before = d.maps.grid.slice();
          if (!way(gate)) continue;
          ok = true;
          // (the second way does not run into the first: it would only loop back to where the first one goes)
          const first: number[] = [];
          before.forEach((v, k) => {
            if (!v && d.maps.grid[k]) first.push(k);
          });
          for (const k of first) out[k] = 1;
          const far = gate + (SIDE - 1) * into,
            through = way(far),
            bridged =
              through && f < at.lower && (yardShape ? yardShape === 'bridge' : rng.next() < ATRIUM_BRIDGE_CHANCE);
          if (!through) for (const s of sides) if (s.gate !== gate && s.gate !== far && way(s.gate)) break;
          for (const k of first) out[k] = 0;
          if (bridged) bridge = Array.from({ length: COURT }, (_, m) => gate + (edge + m) * into);
          for (const k of bridge) d.maps.grid[k] = 1;
          balconies.push([]);
          bridges.push(bridge);
          continue;
        }
        if (shape === 'walk') {
          // the whole side, and of its two corners those that find a way on into the floor (one at least)
          const ends = [gate - mid * along, gate + mid * along].filter(way);
          if (!ends.length) continue;
          balcony = [...run(gate, along, COURT), ...ends];
        } else {
          if (!way(gate)) continue;
          balcony = run(gate, along, BALCONY);
          // (a bridge needs a way on at its far end: without one this floor keeps the lookout alone)
          const far = gate + (SIDE - 1) * into;
          if (shape === 'bridge' && way(far)) {
            bridge = Array.from({ length: COURT }, (_, m) => gate + (m + 1) * into);
            balcony.push(...run(far, along, BALCONY));
          }
        }
        ok = true;
        for (const k of [...balcony, ...bridge]) d.maps.grid[k] = 1;
        balconies.push(balcony);
        bridges.push(bridge);
      }
    }
    if (ok) {
      // an atrium's ground (the middle and the gallery round it) is a room of its floor: enemies wait there, and it
      // counts with the floor's other rooms (the last of them, so the rooms before keep their numbers)
      if (!open) {
        const d = maps[at.lower]!,
          room = { x: at.i + 1, y: at.j + 1, w: SIDE - 2, h: SIDE - 2 };
        for (let b = 0; b < room.h; b++)
          for (let a = 0; a < room.w; a++) d.maps.roomOf[tile(a + 1, b + 1)] = d.rooms.length;
        d.rooms.push(room);
      }
      return { upper: at.upper, lower: at.lower, tiles, open, balconies, bridges };
    }
    kept.forEach((k, n) => {
      maps[n]!.maps.grid.set(k.grid);
      keepOut[n]!.set(k.out);
    });
  }
  return null;
}

// no hazard floor on the tiles or right next to them
function clearHazardsAround(plan: FloorPlan, tiles: number[]) {
  tiles.forEach(k =>
    around(plan.gen.W, k).forEach(t => {
      plan.gen.hazard[t] = 0;
    }),
  );
}
// One try at a building from this exact seed. The random numbers are drawn in this order: the number of floors, the
// route, the floors, the start room, then step by step along the route its stairwell or lift, floor by floor the
// hazard floors, the lockdown room.
// Returns null when a stairwell or lift finds no place, or a floor tile ends up cut off
function tryBuilding(biome: Biome, bossKind: string, seed: number): Building | null {
  const rng = createRng(seed);
  const FLOORS = rng.randi(FLOORS_RANGE[0], FLOORS_RANGE[1]),
    route = makeRoute(FLOORS, rng, LIFT_REACH),
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
  maps.forEach(d => thinDoorPairs(d));
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
      link = placeLink(maps, keepOut, stairs, up, lo, { floor, from, skip: before ? -1 : startIdx }, rng, CFG);
    if (!link) return null;
    links.push(link);
  }
  // (after the stairwells and lifts, which need their places more; only in the sectors that have one, so the other
  // sectors' buildings draw the same random numbers as before)
  const kinds = COURT_KINDS[biome.code],
    // (in the ruins the fog is near: across a wide yard the far wall would not be seen)
    court = kinds ? addCourt(maps, keepOut, kinds, biome.code !== 'RUIN', rng) : null;
  const plans: FloorPlan[] = maps.map((d, floor) => {
    const hazard = new Uint8Array(size);
    if (biome.gen.hazard) addHazards(d, hazard, biome.gen.hazard.count, rng);
    return {
      gen: { W: d.W, H: d.H, maps: d.maps, hazard, rooms: d.rooms, startIdx: -1 },
      hall: d.hall ?? null,
      seen: new Uint8Array(size),
      ...noOpenings(size),
      court:
        court && floor >= court.upper && floor <= court.lower
          ? {
              tiles: court.tiles,
              top: floor === court.upper,
              ground: !court.open && floor === court.lower,
              open: court.open,
              balcony: court.balconies[floor - court.upper] ?? [],
              bridge: court.bridges[floor - court.upper] ?? [],
            }
          : null,
    };
  });
  // An atrium: open upward on every floor but its top one, a hole on every floor but its lowest, and the gap to
  // the next floor walled over the galleries. A yard: a hole with no ceiling on every floor (but for a bridge, which
  // is floor under the open sky), and that gap walled over the balconies. No hazard floor in either
  if (court)
    for (let n = court.upper; n <= court.lower; n++) {
      const p = plans[n]!;
      for (const k of court.tiles) {
        if (court.open || n > court.upper) p.noCeil[k] = 1;
        if ((court.open || n < court.lower) && !p.court!.bridge.includes(k)) p.voids[k] = 1;
        for (const t of around(W, k)) {
          p.gen.hazard[t] = 0;
          if (!court.open && n > court.upper && !court.tiles.includes(t)) p.shaft[t] = 1;
        }
      }
      for (const k of p.court!.balcony) p.shaft[k] = 1;
    }
  // how each floor is drawn round its stairwells and lifts (engine/src/world/stairwells.ts), and no hazard floor there
  for (const l of links) {
    clearHazardsAround(plans[l.upper]!, l.strip);
    clearHazardsAround(plans[l.lower]!, l.strip);
  }
  markLinkOpenings(plans, maps, links, CFG);
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
  if (!allReached(maps, links, top.gen.startIdx, FLOOR_H)) return null;
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
