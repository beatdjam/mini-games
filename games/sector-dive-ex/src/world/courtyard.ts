import type { Rng } from '@engine/core/util.ts';
import type { TileMapData } from '@engine/world/dungeon.ts';
import { around, carveCorridorFrom } from '@engine/world/stairwells.ts';
import type { FloorPlan } from './building.ts';
// The courtyard of a building (world/building.ts makeBuilding): where it goes, how it is carved out of the floors it
// passes, and how those floors are opened round it. Drawn by courtMesh.ts (and levelMesh.ts buildYardShell)
//
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
// furnace hall, a studio, a machine hall, a mall's atrium)
const COURT_KINDS: Record<string, 'both' | 'yard' | 'atrium'> = {
  CITY: 'both',
  KWLN: 'yard',
  RUIN: 'yard',
  FORGE: 'atrium',
  NOISE: 'atrium',
  DATA: 'atrium',
  MALL: 'atrium',
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
// the courtyard's open middle on one floor (FloorPlan.court). An atrium (`open` false): `top` has the skylight over
// it, `ground` is the floor one walks on (elsewhere it is a hole with a rail round it). A yard (`open`): `balcony` are
// this floor's tiles that look out on it, `bridge` the tiles of the middle that are floor there
export interface CourtFloor {
  tiles: number[];
  top: boolean;
  ground: boolean;
  open: boolean;
  balcony: number[];
  bridge: number[];
}
// dev: every courtyard is of this kind (null = by the building's own dice), every balcony of a yard of this shape
let courtKind: boolean | null = null,
  yardShape: YardShape | null = null;
export function devCourtOpen(open: boolean | null, shape: YardShape | null = null) {
  courtKind = open;
  yardShape = shape;
}

// The places for a courtyard that needs a square of `side` tiles (see carveCourt): where that square is
// wall on the most floors next to each other (two at least), and how many floors that is. `open`: a yard, open to the
// sky, so the square has no floor on the floors above it either (they are not carved, only looked at)
function courtPlaces(maps: TileMapData[], keepOut: Uint8Array[], side: number, open: boolean) {
  const { W, H } = maps[0]!,
    last = maps.length - 2, // the lowest floor a courtyard may reach
    free = (f: number, i: number, j: number, carved = true): boolean => {
      for (let b = 0; b < side; b++)
        for (let a = 0; a < side; a++) {
          const k = (j + b) * W + i + a;
          if (maps[f]!.maps.grid[k] || (carved && keepOut[f]![k])) return false;
        }
      return true;
    },
    // (going down from the top floor, the first floor with floor on the square: a yard starts no higher than that)
    clearAbove = (i: number, j: number, upper: number): boolean => {
      for (let f = 0; f < upper; f++) if (!free(f, i, j, false)) return false;
      return true;
    };
  let floors = 2;
  let places: { i: number; j: number; upper: number; lower: number }[] = [];
  for (let j = 1; j + side < H; j++)
    for (let i = 1; i + side < W; i++)
      for (let upper = 0; upper + floors - 1 <= last; upper++) {
        if (open && !clearAbove(i, j, upper)) break;
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
// at least; never the lowest floor, whose boss room stands higher than a floor); a yard only where no floor above has
// floor on the square (it is open to the sky: a corridor of a floor above would run over it). On each of them a gallery is carved
// round the open middle, with a corridor to the rest of the floor; on the lowest the middle is floor too. Returns
// null (and leaves the maps as they were) when no place fits
function carveCourt(
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
    small = courtPlaces(maps, keepOut, open ? COURT_YARD + 2 : COURT_ROOFED + 4, open),
    wide = open && wideToo ? courtPlaces(maps, keepOut, COURT_YARD_WIDE + 2, true) : null,
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
// The courtyard of a building in this sector, or null: none in a sector that has no kind (COURT_KINDS), or when no
// place fits. Draws its random numbers only in the sectors that have one, so the other sectors' buildings stay as they are
export function placeCourt(maps: TileMapData[], keepOut: Uint8Array[], sector: string, rng: Rng): Court | null {
  const kinds = COURT_KINDS[sector];
  // (in the ruins the fog is near: across a wide yard the far wall would not be seen)
  return kinds ? carveCourt(maps, keepOut, kinds, sector !== 'RUIN', rng) : null;
}
// the courtyard as seen on one floor of the building (null where it does not pass)
export function courtFloor(court: Court | null, floor: number): CourtFloor | null {
  if (!court || floor < court.upper || floor > court.lower) return null;
  return {
    tiles: court.tiles,
    top: floor === court.upper,
    ground: !court.open && floor === court.lower,
    open: court.open,
    balcony: court.balconies[floor - court.upper] ?? [],
    bridge: court.bridges[floor - court.upper] ?? [],
  };
}
// An atrium: open upward on every floor but its top one, a hole on every floor but its lowest, and the gap to the
// next floor walled over the galleries. A yard: a hole with no ceiling on every floor (but for a bridge, which is
// floor under the open sky), and that gap walled over the balconies. No hazard floor in either
export function openCourt(plans: FloorPlan[], court: Court, W: number) {
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
}
