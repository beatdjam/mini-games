import { createRng } from '@engine/core/util.ts';
import { packBits, unpackBits } from '@engine/core/store.ts';
import { generateDungeon } from '@engine/world/dungeon.ts';
import {
  allReached,
  around,
  groundsOf,
  makeRoute,
  markAround,
  markLinkOpenings,
  noOpenings,
  placeLink,
  roomDoors,
  roomTiles,
  thinDoorPairs,
} from '@engine/world/stairwells.ts';
import type { BuildingLink, FloorOpenings, StairwellConfig } from '@engine/world/stairwells.ts';
// (what the game's other files and the tests take from here)
export { makeRoute, roomDoors, roomsOnWay, roomTiles } from '@engine/world/stairwells.ts';
export type { BuildingLink } from '@engine/world/stairwells.ts';
import { COVER_H, HALL_H, PLAT_H, WALL_H } from '../data/level.ts';
import { BOSS_META } from '../data/bosses.ts';
import type { Biome, BuildingState } from '../data/types.ts';
import { ARENA_FROM, ARENA_PILLARS, addHazards } from './levelGen.ts';
import { wallBeyond, wallFloor, wallLinks } from './looks/common.ts';
import { massOf } from './looks/outside.ts';
import { placeIslands } from './looks/mall/islands.ts';
import type { Island } from './looks/mall/islands.ts';
import { sinkFoodCourt } from './looks/mall/sunken.ts';
import type { GeneratedLevel } from './levelGen.ts';
import { courtFloor, openCourt, placeCourt } from './courtyard.ts';
import type { Court, CourtFloor } from './courtyard.ts';
// (what the game's other files and the tests take from here)
export { devCourtOpen } from './courtyard.ts';
export type { Court, YardShape } from './courtyard.ts';
// One depth is one building: 3 to 5 floors stacked FLOOR_H apart (the lowest LAST_GAP under the one above it), with the boss room (a hall with a single door,
// engine/src/world/dungeon.ts) on the lowest floor. Floor 0 is the top, where the run starts. The floors are visited
// in the order of the building's route (it starts on the top floor and ends on the lowest, but may go down two floors
// and back up one in between); each step of the route is one stairwell or one lift, at the same place on the floors
// it joins, so the building is one connected space. Enemies get stronger along the route, not floor by floor. The whole building is generated at once from one seed, so the same seed gives
// the same building again (resuming a suspended run rebuilds it).
// No three.js and no tile world here: only the plans. world/level.ts draws them and makes one floor the active one.
//
// A stairwell is a straight strip of tiles: E (the foot), a ramp tile for every RISE of the gap between its floors (4
// for FLOOR_H, 7 for LAST_GAP), then the landing L1 and L2.
//   on the lower floor the whole strip is floor: E on the ground, the ramps rising to the gap, L1 and L2 at the gap
//   on the upper floor only L1 and L2 are floor (on its ground, the same height in the world); the rest is open
// The player is on the lower floor's tile world up to L1 and on the upper floor's from L2 on (flow/events.ts).
// A lift is one tile S that is floor on both floors; standing on it rides to the other one.
// The version of how makeBuilding lays a building out from its seed. Raise it with any change that gives a seed another
// building (rooms, stairwells and lifts, the route, courtyards): a run suspended before then is fitted onto the new
// building when it is resumed (fitBuildingState). A test in test/smoke.test.ts fails when the layout changes
export const BUILDING_V = 6;
// ---- tuning numbers used only here ----
export const FLOORS_RANGE: [number, number] = [3, 5]; // floors of a building
// ordinary rooms per floor (min, max) by the number of floors, so that a building has about as many rooms with
// enemies as a Sector Dive depth (about 13.6 on average) however many floors it has. null = the sector's own numbers
const ROOMS_BY_FLOORS: Record<number, [number, number] | null> = { 3: null, 4: [4, 4], 5: [3, 3] };
const LIFT_REACH = 3; // a lift goes at most this many floors
const STAIRS_CHANCE = 0.5; // a step of one floor is a stairwell this often, a lift otherwise
export const FLOOR_H = 8; // from the ground of one floor to the ground of the next (m)
// ... but from the lowest floor's to the one above it: its boss room is HALL_H high, and the floor above stands over it
// as far as the others stand over their WALL_H, so the room stays under it (with FLOOR_H its top stood in that floor)
export const LAST_GAP = HALL_H + FLOOR_H - WALL_H;
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
// ... in a building of `floors` floors: the gap over the lowest is LAST_GAP
function cfgOf(floors: number): StairwellConfig {
  const gaps: number[] = [];
  gaps[floors - 2] = LAST_GAP;
  return { ...CFG, gaps };
}

// one floor of the building, as generated
// (how the floor is drawn where it meets the floors above and below: FloorOpenings, engine/src/world/stairwells.ts)
export interface FloorPlan extends FloorOpenings {
  gen: GeneratedLevel; // maps, rooms and hazard floors; startIdx is the start room on floor 0 and -1 on the others
  hall: { room: number; door: number } | null; // the boss room and its door (lowest floor only)
  seen: Uint8Array; // per tile: shown on the map; kept while the building lives, so a floor stays explored
  // the courtyard's open middle on this floor (null = none here; world/courtyard.ts)
  court: CourtFloor | null;
  islands: Island[]; // the mall's and the hospital's islands of waist-high cover in the middle of their big rooms (none in the other sectors)
  above: number; // from its ground to the ground of the floor above (m; the top floor: FLOOR_H)
}
export interface Building {
  seed: number; // what makeBuilding was given
  biome: Biome;
  plans: FloorPlan[];
  route: number[]; // the floors in the order they are visited: route[0] = 0 (the top), the last = the lowest floor
  links: BuildingLink[]; // step by step along the route: links[n] joins route[n] and route[n + 1]
  lockdown: { floor: number; room: number } | null; // the room where the lockdown happens (none when no room fits)
  court: Court | null; // the courtyard (none in most sectors, or when no place fits)
  grounds: number[]; // the height of each floor's ground (m): the top floor at 0, the ones below it lower
}
// the building of the depth being played; replaced as a whole by setBuilding
export let building: Building | null = null;
export function setBuilding(b: Building | null) {
  building = b;
}

// The explored map of every floor as text, for the checkpoint (engine packBits: one bit per tile). A resumed run gets
// its map back with unpackSeen (the building is rebuilt from its seed, the map is not)
export const packSeen = (b: Building): string[] => b.plans.map(p => packBits(p.seen));
// puts a packed map back on the building's floors; a floor without one (or with a broken one) stays unexplored
export function unpackSeen(b: Building, packed: string[] | undefined) {
  b.plans.forEach((p, floor) => unpackBits(packed?.[floor] ?? '', p.seen));
}
// A run suspended on a building of an older BUILDING_V: its seed gives another building now, so what was saved by
// floor and room number would point at other places. The state is put onto building b instead: the player goes on at
// the same step of the route, where its stairwell or lift lets them off (the start room at the first step). The floors
// before it on the route count as done (no enemies, no weapon caches, the lockdown over if it was there), so their chips
// are not dropped twice; the floors from it on are not entered yet. The map starts unexplored
export function fitBuildingState(st: BuildingState, b: Building) {
  const step = Math.min(Math.max(st.step, 0), b.plans.length - 1),
    done = b.route.slice(0, step);
  st.v = BUILDING_V;
  st.floors = b.plans.length;
  st.step = step;
  st.floor = b.route[step]!;
  st.at = step - 1;
  st.cleared = b.plans.map((p, floor) => (done.includes(floor) ? p.gen.rooms.map((_, idx) => idx) : []));
  st.visited = b.plans.map((_, floor) => done.includes(floor));
  if (b.lockdown && done.includes(b.lockdown.floor)) st.ld = 1;
  delete st.seen;
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
    rooms = ROOMS_BY_FLOORS[FLOORS],
    cfg = cfgOf(FLOORS),
    grounds = groundsOf(cfg, FLOORS);
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
      link = placeLink(maps, keepOut, stairs, up, lo, { floor, from, skip: before ? -1 : startIdx }, rng, cfg);
    if (!link) return null;
    links.push(link);
  }
  // (after the stairwells and lifts, which need their places more; only in the sectors that have one, so the other
  // sectors' buildings draw the same random numbers as before)
  const court = placeCourt(maps, keepOut, biome.code, rng);
  const plans: FloorPlan[] = maps.map((d, floor) => {
    const hazard = new Uint8Array(size);
    if (biome.gen.hazard) addHazards(d, hazard, biome.gen.hazard.count, rng);
    return {
      gen: { W: d.W, H: d.H, maps: d.maps, hazard, rooms: d.rooms, startIdx: -1 },
      hall: d.hall ?? null,
      seen: new Uint8Array(size),
      ...noOpenings(size),
      court: courtFloor(court, floor),
      islands: [],
      above: floor ? grounds[floor - 1]! - grounds[floor]! : FLOOR_H,
    };
  });
  if (court) openCourt(plans, court, W);
  // how each floor is drawn round its stairwells and lifts (engine/src/world/stairwells.ts), and no hazard floor there
  for (const l of links) {
    clearHazardsAround(plans[l.upper]!, l.strip);
    clearHazardsAround(plans[l.lower]!, l.strip);
  }
  markLinkOpenings(plans, maps, links);
  // what the floors' walls look out on (looks/common.ts wallBeyond): the floors of the whole building count as floor,
  // a yard's middle as the outside, on the floors it passes and over them (it is open to the sky), and the narrow gaps
  // and notches between the floors as floor too (looks/outside.ts massOf: the building's outside fills them)
  const floors = new Uint8Array(size);
  plans.forEach(p => p.gen.maps.grid.forEach((v, k) => (floors[k] ||= v === 1 || p.voids[k] ? 1 : 0)));
  const mass = massOf(floors, W, maps[0]!.H);
  plans.forEach((p, n) => {
    const beyond = Uint8Array.from(mass);
    if (court?.open && n <= court.lower) for (const k of court.tiles) beyond[k] = 2;
    wallBeyond.set(p.gen.maps.grid, beyond);
    wallFloor.set(p.gen.maps.grid, n);
    // (the lifts and stairwells that stop on this floor, for what is drawn round them: looks/common.ts wallLinks)
    const here = links.filter(l => n >= l.upper && n <= l.lower);
    wallLinks.set(p.gen.maps.grid, {
      lifts: new Set(here.filter(l => l.kind === 'elevator').map(l => l.strip[0]!)),
      strips: new Set(here.flatMap(l => l.strip)),
    });
  });
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
  if (!allReached(maps, links, top.gen.startIdx, cfg)) return null;
  // the mall's food court is a plaza a step or two below its aisle (no random numbers: the rest is as it was)
  if (biome.code === 'MALL') plans.forEach(p => sinkFoodCourt(p));
  // ... and its big rooms get islands of cover in the middle (from a generator of their own, so the building's random numbers go on as they did)
  if (biome.code === 'MALL') plans.forEach((p, floor) => placeIslands(p, seed, floor));
  // ... and so do the hospital's (the wards' beds, the waiting hall's benches), none of its rooms being sunk
  if (biome.code === 'HOSP') plans.forEach((p, floor) => placeIslands(p, seed, floor, -1));
  // the lockdown room: one that can be shut (every opening is a door), with enemies in it
  const fits: { floor: number; room: number }[] = [];
  plans.forEach((p, floor) =>
    p.gen.rooms.forEach((_, room) => {
      if (room !== p.gen.startIdx && room !== p.hall?.room && roomDoors(p.gen, room).closable)
        fits.push({ floor, room });
    }),
  );
  const lockdown = fits.length ? rng.pick(fits) : null;
  return { seed, biome, plans, route, links, lockdown, court, grounds };
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
