import { COVER_H } from '@engine/world/tiles.ts';
import { createRng } from '@engine/core/util.ts';
import type { FloorPlan } from '../../building.ts';
import { wallLinks } from '../common.ts';
import { foodCourtRoom } from './rooms.ts';
// The mall's islands: in a big room, a block of waist-high cover of 1 x 2 or 2 x 2 tiles in the middle of the floor (a
// rack of clothes, a table of books, a showcase ...; cover.ts draws it as one piece for the kind of shop). It is cover
// like any other (a bullet flies over it), only bigger, and it is laid out after the rooms, the stairwells and the
// food court, from a generator of its own (the building's seed and the floor), so no random number of the building is
// used. Called by the building (world/building.ts) for every floor of a mall.
// ---- tuning numbers used only here ----
export const ISLAND_MIN_AREA = 42; // tiles: a room this big or bigger gets an island
const ISLAND_TWO_AREA = 56; // ... two islands from this size, if they fit
const ISLAND_THREE_AREA = 72; // ... three from this
const WALL_GAP = 2; // free tiles between an island and the room's wall
const ISLAND_GAP = 2; // free tiles between two islands
const FREE_RING = 1; // tiles round an island with no other cover, hazard floor, deck, ramp or door
const LINK_CLEAR = 2; // tiles round a stairwell, a lift or a courtyard's open middle that stay free
const SQUARE_SHARE = 0.5; // of the islands, this many are 2 x 2 (the rest 1 x 2, either way round)
const CENTER_JITTER = 1.5; // tiles^2: the place nearest the middle is not always taken (random addition to the distance)
const SEED_MIX = 0x2f6b9e3d; // mixed into the building's seed for the islands' own generator
const FLOOR_MIX = 0x9e3779b9; // ... and the floor

// where an island stands: its top left tile and its size in tiles
export interface Island {
  i: number;
  j: number;
  w: number;
  h: number;
}

// puts the islands of the floor into the cover map (and into plan.islands); `seed` is the building's seed, `floor` the floor's number
// `sunk`: the room that has a sunken floor and gets none (the food court; the hospital has no such room: -1)
export function placeIslands(plan: FloorPlan, seed: number, floor: number, sunk = foodCourtRoom(plan)) {
  const d = plan.gen,
    { W, maps } = d,
    rng = createRng((seed ^ SEED_MIX) + Math.imul(floor + 1, FLOOR_MIX)),
    strips = wallLinks.get(maps.grid)?.strips,
    // tiles that no island may stand on or next to
    taboo = new Set<number>(),
    ring = (k: number, n: number) => {
      for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) taboo.add(k + dj * W + di);
    };
  plan.court?.tiles.forEach(k => ring(k, LINK_CLEAR));
  strips?.forEach(k => ring(k, LINK_CLEAR));
  const bad = (k: number) =>
    maps.grid[k] !== 1 ||
    maps.hgt[k]! !== 0 ||
    maps.ramp[k]! >= 0 ||
    !!maps.cover[k] ||
    !!maps.door?.[k] ||
    !!d.hazard[k] ||
    !!plan.voids[k] ||
    !!plan.noFloor[k] ||
    !!plan.noCeil[k] ||
    !!plan.shaft[k];
  d.rooms.forEach((r, room) => {
    if (r.plat || room === d.startIdx || room === plan.hall?.room || room === sunk) return;
    const area = r.w * r.h;
    if (area < ISLAND_MIN_AREA) return;
    const want = area >= ISLAND_THREE_AREA ? 3 : area >= ISLAND_TWO_AREA ? 2 : 1,
      cx = r.x + (r.w - 1) / 2,
      cy = r.y + (r.h - 1) / 2,
      mine: Island[] = [];
    for (let n = 0; n < want; n++) {
      const square = rng.next() < SQUARE_SHARE,
        across = rng.next() < 0.5,
        w = square || across ? 2 : 1,
        h = square || !across ? 2 : 1,
        spots: { i: number; j: number; score: number }[] = [];
      for (let j = r.y + WALL_GAP; j + h <= r.y + r.h - WALL_GAP; j++)
        for (let i = r.x + WALL_GAP; i + w <= r.x + r.w - WALL_GAP; i++) {
          const dx = i + (w - 1) / 2 - cx,
            dy = j + (h - 1) / 2 - cy;
          spots.push({ i, j, score: dx * dx + dy * dy + rng.next() * CENTER_JITTER });
        }
      spots.sort((a, b) => a.score - b.score);
      for (const s of spots) {
        const here: Island = { i: s.i, j: s.j, w, h };
        if (!fits(here, mine)) continue;
        paint(here, 1);
        if (reached(r)) {
          mine.push(here);
          break;
        }
        paint(here, 0);
      }
    }
    plan.islands.push(...mine);
  });

  // is the island on free floor, away from the others and from the things that must stay clear
  function fits(a: Island, others: Island[]): boolean {
    for (let j = a.j - FREE_RING; j < a.j + a.h + FREE_RING; j++)
      for (let i = a.i - FREE_RING; i < a.i + a.w + FREE_RING; i++) {
        const k = j * W + i,
          inside = i >= a.i && i < a.i + a.w && j >= a.j && j < a.j + a.h;
        // (next to the island, a wall is fine: it is only the cover, the hazard floor and the like that must be away)
        if (inside ? bad(k) || taboo.has(k) : maps.grid[k] === 1 && bad(k)) return false;
      }
    return others.every(
      o =>
        a.i >= o.i + o.w + ISLAND_GAP ||
        o.i >= a.i + a.w + ISLAND_GAP ||
        a.j >= o.j + o.h + ISLAND_GAP ||
        o.j >= a.j + a.h + ISLAND_GAP,
    );
  }
  function paint(a: Island, on: 0 | 1) {
    for (let j = a.j; j < a.j + a.h; j++)
      for (let i = a.i; i < a.i + a.w; i++) {
        maps.cover[j * W + i] = on;
        maps.hgt[j * W + i] = on ? COVER_H : 0;
      }
  }
  // can one walk (4 ways) from any free floor tile of the room to every other
  function reached(r: { x: number; y: number; w: number; h: number }): boolean {
    const open: number[] = [];
    for (let j = r.y; j < r.y + r.h; j++)
      for (let i = r.x; i < r.x + r.w; i++)
        if (maps.grid[j * W + i] === 1 && !maps.cover[j * W + i]) open.push(j * W + i);
    const seen = new Set<number>(open.slice(0, 1)),
      queue = open.slice(0, 1);
    for (let n = 0; n < queue.length; n++)
      for (const t of [queue[n]! + 1, queue[n]! - 1, queue[n]! + W, queue[n]! - W]) {
        const i = t % W,
          j = (t / W) | 0;
        if (
          seen.has(t) ||
          i < r.x ||
          i >= r.x + r.w ||
          j < r.y ||
          j >= r.y + r.h ||
          maps.grid[t] !== 1 ||
          maps.cover[t]
        )
          continue;
        seen.add(t);
        queue.push(t);
      }
    return seen.size === open.length;
  }
}
