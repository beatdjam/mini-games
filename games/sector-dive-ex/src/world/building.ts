import { createRng } from '@engine/core/util.ts';
import type { Rng } from '@engine/core/util.ts';
import { generateFloors } from '@engine/world/floorgen.ts';
import type { FloorLink, FloorSpot } from '@engine/world/floors.ts';
import { forEachRoomTile } from '@engine/world/dungeon.ts';
import type { TileMapData } from '@engine/world/dungeon.ts';
import { COVER_H, PLAT_H } from '../data/level.ts';
import { BOSS_META } from '../data/bosses.ts';
import type { Biome } from '../data/types.ts';
import { ARENA_FROM, ARENA_PILLARS, addHazards } from './levelGen.ts';
import type { GeneratedLevel } from './levelGen.ts';
// One depth is one building: FLOORS floors joined by stairs and lifts, with the boss room (a hall with a single door,
// engine/src/world/dungeon.ts) on the lowest floor. The whole building is generated at once from one seed, so the same
// seed gives the same building again (resuming a suspended run rebuilds it). Floor 0 is the top, where the run starts.
// No three.js and no tile world here: only the plans. The floor being played is built from its plan by world/level.ts.
// ---- tuning numbers used only here ----
export const FLOORS = 3; // floors of a building
const BOSS_HALL = 12; // side of the boss room (tiles), the same as the floor of a boss arena
const LAST_FLOOR_ROOMS: [number, number] = [2, 3]; // ordinary rooms on the lowest floor, next to the boss room
const STAIRS_PER_PAIR = 1; // stairs between two neighbouring floors
const LIFTS_PER_PAIR = 1; // lifts between two neighbouring floors
const LINK_HAZARD_GAP = 1; // no hazard floor this many tiles around the end of a stairs or lift

// one floor of the building, as generated
export interface FloorPlan {
  gen: GeneratedLevel; // maps, rooms and hazard floors; startIdx is the start room on floor 0 and -1 on the others
  hall: { room: number; door: number } | null; // the boss room and its door (lowest floor only)
  seen: Uint8Array; // per tile: shown on the map; kept while the building lives, so a floor stays explored
}
export interface Building {
  seed: number;
  biome: Biome;
  plans: FloorPlan[];
  links: FloorLink[]; // the stairs and lifts (kind 'stairs' / 'elevator'), each joining two neighbouring floors
  lockdown: { floor: number; room: number } | null; // the room where the lockdown happens (none when no room fits)
}
// the building of the depth being played; replaced as a whole by setBuilding
export let building: Building | null = null;
export function setBuilding(b: Building | null) {
  building = b;
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
const spotTile = (d: TileMapData, s: FloorSpot): number => s.j * d.W + s.i;

// no hazard floor in the room or just outside it
function clearHazardsAround(plan: FloorPlan, x: number, y: number, w: number, h: number) {
  const { W, H, hazard } = plan.gen;
  for (let j = y - 1; j <= y + h; j++)
    for (let i = x - 1; i <= x + w; i++) if (i >= 0 && j >= 0 && i < W && j < H) hazard[j * W + i] = 0;
}

// The same seed, sector and boss give the same building. The random numbers are drawn in this order: the floors and
// their links (generateFloors), floor by floor the hazard floors, the start room, the lockdown room.
export function makeBuilding(biome: Biome, bossKind: string, seed: number): Building {
  const rng: Rng = createRng(seed);
  const base = { ...biome.gen, deckH: PLAT_H, coverH: COVER_H, doors: true };
  const last = {
    ...base,
    countMin: LAST_FLOOR_ROOMS[0],
    countMax: LAST_FLOOR_ROOMS[1],
    hall: { w: BOSS_HALL, h: BOSS_HALL },
  };
  const g = generateFloors(
    {
      floors: FLOORS,
      dungeon: Array.from({ length: FLOORS }, (_, n) => (n === FLOORS - 1 ? last : base)),
      stairs: STAIRS_PER_PAIR,
      lifts: LIFTS_PER_PAIR,
    },
    rng,
  );
  const plans: FloorPlan[] = g.maps.map(d => {
    const hazard = new Uint8Array(d.W * d.H);
    if (biome.gen.hazard) addHazards(d, hazard, biome.gen.hazard.count, rng);
    return {
      gen: { W: d.W, H: d.H, maps: d.maps, hazard, rooms: d.rooms, startIdx: -1 },
      hall: d.hall ?? null,
      seen: new Uint8Array(d.W * d.H),
    };
  });
  // the start room, on the top floor: no hazard floor in it or its doorways (as in a Sector Dive area)
  const top = plans[0]!;
  top.gen.startIdx = rng.randi(0, top.gen.rooms.length - 1);
  const start = top.gen.rooms[top.gen.startIdx]!;
  clearHazardsAround(top, start.x, start.y, start.w, start.h);
  // nor around the ends of the stairs and lifts, on the doors, or in the boss room
  for (const l of g.links)
    for (const s of [l.a, l.b]) {
      const g2 = LINK_HAZARD_GAP;
      clearHazardsAround(plans[s.floor]!, s.i - g2 + 1, s.j - g2 + 1, 2 * g2 - 1, 2 * g2 - 1);
    }
  plans.forEach(p => {
    p.gen.maps.door?.forEach((v, k) => {
      if (v) p.gen.hazard[k] = 0;
    });
    if (!p.hall) return;
    const hall = p.gen.rooms[p.hall.room]!;
    clearHazardsAround(p, hall.x, hall.y, hall.w, hall.h);
    // the boss's pillars, at the same places as in a boss arena
    if (BOSS_META[bossKind]?.pillars)
      for (const [pi, pj] of ARENA_PILLARS)
        p.gen.maps.grid[(hall.y + pj - ARENA_FROM) * p.gen.W + hall.x + pi - ARENA_FROM] = 0;
  });
  // the lockdown room: one that can be shut (every opening is a door), with enemies in it and no stairs or lift
  const fits: { floor: number; room: number }[] = [];
  g.maps.forEach((d, floor) =>
    d.rooms.forEach((_, room) => {
      const plan = plans[floor]!;
      if (room === plan.gen.startIdx || room === plan.hall?.room) return;
      if (g.links.some(l => [l.a, l.b].some(s => s.floor === floor && d.maps.roomOf[spotTile(d, s)] === room))) return;
      if (roomDoors(d, room).closable) fits.push({ floor, room });
    }),
  );
  return { seed, biome, plans, links: g.links, lockdown: fits.length ? rng.pick(fits) : null };
}

// the tiles of a room (for tests and checks)
export function roomTiles(d: TileMapData, room: number): number[] {
  const out: number[] = [];
  forEachRoomTile(d.rooms[room]!, (i, j) => out.push(j * d.W + i));
  return out;
}
