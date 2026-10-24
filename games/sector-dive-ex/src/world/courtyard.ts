import type { Rng } from '@engine/core/util.ts';
import type { TileMapData } from '@engine/world/dungeon.ts';
import { around, carveCorridorFrom } from '@engine/world/stairwells.ts';
import type { FloorPlan } from './building.ts';
// The courtyard of a building (world/building.ts makeBuilding): where it goes, how it is carved out of the floors it
// passes, and how those floors are opened round it. Drawn by courtMesh.ts (and levelMesh.ts buildYardShell)
//
// A courtyard, in two kinds (and a long atrium).
// An atrium: a well COURT_ROOFED tiles a side, roofed with a skylight, open through several floors, with a gallery one
// tile wide round it on every floor it passes and its ground on the lowest of them. Looked into and up from. The
// gallery has two ways in: one on one side, the other on the far side or, where none is found there, round the corner;
// above the ground a bridge may join two on the far sides straight across the well (ATRIUM_BRIDGE_CHANCE). The ground
// and the gallery round it are a room.
// A galleria, an atrium that runs along a passage: the well is COURT_ROOFED tiles wide and GALLERIA_LENGTHS long (the
// longest that fits, else the square atrium), along x or along z, the gallery round it as before. The gallery has a way
// in at each end and, where one is found, a third on a long side; a bridge crosses the well the short way, a little
// further along on each floor in turn
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
type CourtKind = 'both' | 'yard' | 'atrium' | 'galleria';
const COURT_KINDS: Record<string, CourtKind> = {
  CITY: 'both',
  KWLN: 'yard',
  RUIN: 'yard',
  FORGE: 'atrium',
  NOISE: 'atrium',
  DATA: 'atrium',
  MALL: 'galleria',
  HOSP: 'atrium', // a hospital's light well, roofed in glass
};
const COURT_ROOFED = 3,
  COURT_YARD = 5,
  COURT_YARD_WIDE = 7; // side of the open middle (tiles)
const GALLERIA_LENGTHS = [9, 7]; // length of a galleria's open middle (tiles), the longest first; none fits: an atrium
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
  w: number; // the open middle is w tiles wide (x) and h deep (z): a square, but for a galleria's long hole
  h: number;
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

// The places for a courtyard that needs a rectangle of `sw` by `sh` tiles (see carveCourt): where that rectangle is
// wall on the most floors next to each other (two at least), and how many floors that is. `open`: a yard, open to the
// sky, so the rectangle has no floor on the floors above it either (they are not carved, only looked at)
function courtPlaces(maps: TileMapData[], keepOut: Uint8Array[], sw: number, sh: number, open: boolean) {
  const { W, H } = maps[0]!,
    last = maps.length - 2, // the lowest floor a courtyard may reach
    free = (f: number, i: number, j: number, carved = true): boolean => {
      for (let b = 0; b < sh; b++)
        for (let a = 0; a < sw; a++) {
          const k = (j + b) * W + i + a;
          if (maps[f]!.maps.grid[k] || (carved && keepOut[f]![k])) return false;
        }
      return true;
    },
    // (going down from the top floor, the first floor with floor on the rectangle: a yard starts no higher than that)
    clearAbove = (i: number, j: number, upper: number): boolean => {
      for (let f = 0; f < upper; f++) if (!free(f, i, j, false)) return false;
      return true;
    };
  let floors = 2;
  let places: { i: number; j: number; upper: number; lower: number }[] = [];
  for (let j = 1; j + sh < H; j++)
    for (let i = 1; i + sw < W; i++)
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
// the places for a galleria whose open middle is COURT_ROOFED wide and `length` long, along z or along x: whichever
// of the two has the more floors (both, when they have as many)
function galleriaPlaces(maps: TileMapData[], keepOut: Uint8Array[], length: number): Place[] {
  const wide = COURT_ROOFED + 4,
    long = length + 4,
    along = courtPlaces(maps, keepOut, wide, long, false),
    across = courtPlaces(maps, keepOut, long, wide, false),
    tag = (p: { places: Omit<Place, 'hw' | 'hh'>[] }, hw: number, hh: number): Place[] =>
      p.places.map(at => ({ ...at, hw, hh }));
  if (along.floors === across.floors)
    return [...tag(along, COURT_ROOFED, length), ...tag(across, length, COURT_ROOFED)];
  return along.floors > across.floors ? tag(along, COURT_ROOFED, length) : tag(across, length, COURT_ROOFED);
}
// a place for a courtyard: its top-left tile, the floors, and the size of the open middle (tiles in x, in z)
interface Place {
  i: number;
  j: number;
  upper: number;
  lower: number;
  hw: number;
  hh: number;
}
// Puts a courtyard where a rectangle of its size (the open middle, the gallery and the wall round that) is wall on as many floors next to each other as possible (two
// at least; never the lowest floor, whose boss room stands higher than a floor); a yard only where no floor above has
// floor on the rectangle (it is open to the sky: a corridor of a floor above would run over it). On each of them a gallery is carved
// round the open middle, with a corridor to the rest of the floor; on the lowest the middle is floor too. Returns
// null (and leaves the maps as they were) when no place fits. A galleria is tried at each of GALLERIA_LENGTHS in turn,
// and last as the square atrium
function carveCourt(
  maps: TileMapData[],
  keepOut: Uint8Array[],
  kinds: CourtKind,
  wideToo: boolean,
  rng: Rng,
): Court | null {
  const dice = rng.next() < COURT_OPEN_CHANCE,
    open = kinds === 'both' ? (courtKind ?? dice) : kinds === 'yard',
    // the rectangle: an atrium's middle, its gallery and the wall round that; a yard's middle and the wall round it
    small = courtPlaces(
      maps,
      keepOut,
      open ? COURT_YARD + 2 : COURT_ROOFED + 4,
      open ? COURT_YARD + 2 : COURT_ROOFED + 4,
      open,
    ),
    wide = open && wideToo ? courtPlaces(maps, keepOut, COURT_YARD_WIDE + 2, COURT_YARD_WIDE + 2, true) : null,
    // (a yard takes the wider square unless that costs it more than one floor)
    roomy = !!wide && wide.floors >= 2 && wide.floors >= small.floors - 1,
    COURT = !open ? COURT_ROOFED : roomy ? COURT_YARD_WIDE : COURT_YARD,
    places = (roomy ? wide!.places : small.places).map(at => ({ ...at, hw: COURT, hh: COURT })),
    firstShape = rng.randi(0, YARD_SHAPES.length - 1);
  if (kinds === 'galleria')
    for (const length of GALLERIA_LENGTHS) {
      const found = carveIn(maps, keepOut, galleriaPlaces(maps, keepOut, length), false, firstShape, rng);
      if (found) return found;
    }
  return carveIn(maps, keepOut, places, open, firstShape, rng);
}
// Carves the courtyard at one of `places`, the first that works (all of one size), or null
function carveIn(
  maps: TileMapData[],
  keepOut: Uint8Array[],
  places: Place[],
  open: boolean,
  firstShape: number,
  rng: Rng,
): Court | null {
  const W = maps[0]!.W,
    edge = open ? 1 : 2; // tiles between the rectangle's side and the open middle
  for (let t = 0; t < COURT_TRIES && places.length; t++) {
    const at = places.splice(rng.randi(0, places.length - 1), 1)[0]!,
      // the open middle: COURT wide (x) and DEEP long (z); the rectangle is SW by SH tiles
      COURT = at.hw,
      DEEP = at.hh,
      SW = COURT + 2 * edge,
      SH = DEEP + 2 * edge,
      long = COURT !== DEEP, // a galleria
      kept = maps.map((m, n) => ({ grid: m.maps.grid.slice(), out: keepOut[n]!.slice() })),
      tile = (a: number, b: number) => (at.j + b) * W + at.i + a,
      tiles: number[] = [],
      balconies: number[][] = [],
      bridges: number[][] = [];
    for (let b = edge; b < edge + DEEP; b++) for (let a = edge; a < edge + COURT; a++) tiles.push(tile(a, b));
    let ok = true;
    for (let f = at.upper; f <= at.lower && ok; f++) {
      const d = maps[f]!,
        out = keepOut[f]!,
        mid = (SW - 1) / 2,
        midZ = (SH - 1) / 2;
      for (let b = 0; b < SH; b++)
        for (let a = 0; a < SW; a++) {
          const k = tile(a, b),
            ring = a >= 1 && b >= 1 && a <= SW - 2 && b <= SH - 2;
          out[k] = 1;
          // an atrium: the gallery, and on the lowest floor the middle too
          if (!open && ring && (!tiles.includes(k) || f === at.lower)) d.maps.grid[k] = 1;
        }
      // the way in, from the middle of one side, whichever finds a way: an atrium's goes through the wall round the
      // gallery; a yard's starts at the balcony itself (BALCONY tiles of the wall, side by side). `into`: the step
      // from the gate into the yard; `span`: the tiles from the gate to the gate on the far side
      const sides: { gate: number; along: number; into: number; span: number }[] = [
          { gate: tile(mid, 0), along: 1, into: W, span: SH - 1 },
          { gate: tile(mid, SH - 1), along: 1, into: -W, span: SH - 1 },
          { gate: tile(0, midZ), along: W, into: 1, span: SW - 1 },
          { gate: tile(SW - 1, midZ), along: W, into: -1, span: SW - 1 },
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
      if (long) {
        // A galleria: a way in at each end of the gallery and, if one is found, a third on a long side; and, on a floor
        // where the middle is a hole, now and then a bridge across it (the short way), a little further along on each
        // floor. Each way keeps the later ones from running into it
        const alongZ = DEEP > COURT,
          ends = alongZ ? [sides[0]!.gate, sides[1]!.gate] : [sides[2]!.gate, sides[3]!.gate],
          flanks = alongZ ? [sides[2]!.gate, sides[3]!.gate] : [sides[0]!.gate, sides[1]!.gate],
          made: number[] = [],
          carve = (gate: number): boolean => {
            const before = d.maps.grid.slice();
            if (!way(gate)) return false;
            before.forEach((v, k) => {
              if (!v && d.maps.grid[k]) {
                out[k] = 1;
                made.push(k);
              }
            });
            return true;
          },
          turn = rng.randi(0, 1);
        let ways = 0;
        for (const gate of [ends[turn]!, ends[1 - turn]!]) if (carve(gate)) ways++;
        for (const gate of [flanks[turn]!, flanks[1 - turn]!])
          if (carve(gate)) {
            ways++;
            break;
          }
        for (const k of made) out[k] = 0;
        ok = ways > 0;
        if (!ok) break;
        const bridged = f < at.lower && (yardShape ? yardShape === 'bridge' : rng.next() < ATRIUM_BRIDGE_CHANCE),
          // (across the middle of the hole, a quarter of its length further along on every floor in turn)
          length = Math.max(COURT, DEEP),
          pos = (length - 1) / 2 + (((f - at.upper) % 3) - 1) * Math.floor(length / 4),
          bridge = bridged
            ? Array.from({ length: Math.min(COURT, DEEP) }, (_, m) =>
                alongZ ? tile(edge + m, edge + pos) : tile(edge + pos, edge + m),
              )
            : [];
        for (const k of bridge) d.maps.grid[k] = 1;
        balconies.push([]);
        bridges.push(bridge);
        continue;
      }
      ok = false;
      for (let n = rng.randi(0, 3), tries = 0; tries < 4 && !ok; n = (n + 1) % 4, tries++) {
        const { gate, along, into, span } = sides[n]!;
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
          const far = gate + span * into,
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
          const far = gate + span * into;
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
          room = { x: at.i + 1, y: at.j + 1, w: SW - 2, h: SH - 2 };
        for (let b = 0; b < room.h; b++)
          for (let a = 0; a < room.w; a++) d.maps.roomOf[tile(a + 1, b + 1)] = d.rooms.length;
        d.rooms.push(room);
      }
      return { upper: at.upper, lower: at.lower, tiles, open, w: COURT, h: DEEP, balconies, bridges };
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
