import type { Rng } from '../core/util.ts';
import { SIDE_STEP, createTileGrid } from './tiles.ts';
import { tileWorldOf } from './dungeon.ts';
import type { TileMapData } from './dungeon.ts';
// engine: Where props go. slotsOf finds the places a map offers (wall faces, room corners and middles, room floor,
// corridors, doorways); placeProps hands them out to the props a game's theme lists, at random but never in the way:
// a prop that blocks the way stays off corridors, doorways and the tiles the game keeps free, and only goes where every
// tile that could be walked to before can still be walked to. The engine never knows what a prop looks like: it
// returns ids and slots, and the game builds the meshes (and makes the tiles of blocking props solid). No three.js.

// wall: a face of wall next to a floor tile (side = the side of the floor tile the wall is on; non-blocking props only)
// corner: a room tile with walls on two sides; center: the middle tile of a room; floor: a room tile with no wall next
// to it; corridor: a floor tile outside every room; doorway: a door tile (for things over or beside the door)
export type SlotKind = 'wall' | 'corner' | 'center' | 'floor' | 'corridor' | 'doorway';
export interface Slot {
  kind: SlotKind;
  i: number; // tile column
  j: number; // tile row
  room: number; // the room the tile is in (-1 = none)
  side?: number; // wall slots only: SIDE_PX ... SIDE_NZ, the side of tile (i, j) the wall face is on
}
// A prop a theme can place. `slots` are the kinds it may take; a blocking prop (a crate, a pillar) fills its tile and
// is never put on a wall, corridor or doorway slot, a non-blocking one (a sign, a pipe, a poster) is only looks
export interface PropRule {
  id: string; // the game's name for the prop; returned as it is
  slots: SlotKind[];
  blocks: boolean;
  count: number | [number, number]; // how many on the map (a range draws one random number)
  gap?: number; // at least this many tiles (along x or z, whichever is more) from the other props with the same id
}
export interface Placement {
  id: string;
  slot: Slot;
}

// is tile k a flat floor tile (no deck, ramp or cover): only those take props, except wall faces next to them
function flat(d: TileMapData, k: number): boolean {
  const M = d.maps;
  return M.grid[k] === 1 && M.hgt[k] === 0 && M.ramp[k] < 0 && !M.cover[k];
}
const isDoor = (d: TileMapData, k: number) => !!(d.maps.door && d.maps.door[k]);

// Every slot of the map, row by row, tile by tile; for one tile its wall faces first (in side order), then its other
// slot. Only flat floor tiles (no deck, ramp or cover) have slots. A door tile is only a doorway slot. No random numbers
export function slotsOf(d: TileMapData): Slot[] {
  const { W, H, maps: M } = d,
    out: Slot[] = [];
  const wallAt = (i: number, j: number) => i < 0 || j < 0 || i >= W || j >= H || M.grid[j * W + i] !== 1;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (!flat(d, k)) continue;
      const room = M.roomOf[k];
      if (isDoor(d, k)) {
        out.push({ kind: 'doorway', i, j, room });
        continue;
      }
      const walls: number[] = [];
      SIDE_STEP.forEach(([di, dj], side) => {
        if (wallAt(i + di, j + dj)) walls.push(side);
      });
      for (const side of walls) out.push({ kind: 'wall', i, j, room, side });
      if (room < 0) {
        out.push({ kind: 'corridor', i, j, room });
        continue;
      }
      const r = d.rooms[room],
        mid = i === Math.floor(r.x + r.w / 2) && j === Math.floor(r.y + r.h / 2);
      // two walls at right angles (one along x, one along z); a tile between two walls across it is not a corner
      const corner = walls.some(s => s < 2) && walls.some(s => s >= 2);
      if (mid) out.push({ kind: 'center', i, j, room });
      else if (corner) out.push({ kind: 'corner', i, j, room });
      else if (!walls.length) out.push({ kind: 'floor', i, j, room });
    }
  return out;
}

// how many tiles can be walked to from tile `from` (cover and walls never can); `grid` has the blocking props so far
// made solid
function reachCount(d: TileMapData, grid: Uint8Array, from: number): number {
  const g = createTileGrid({ ...tileWorldOf(d), grid }),
    { W } = d,
    seen = new Uint8Array(grid.length),
    q = [from];
  seen[from] = 1;
  for (let h = 0; h < q.length; h++) {
    const k = q[h],
      i = k % W,
      j = (k / W) | 0;
    SIDE_STEP.forEach(([di, dj], side) => {
      if (!g.inBounds(i + di, j + dj)) return;
      const n = k + di + dj * W;
      if (!seen[n] && g.passable(k, n, side)) {
        seen[n] = 1;
        q.push(n);
      }
    });
  }
  return q.length;
}

// Gives props their slots. The rules are handled in order; for each, the count is drawn (a range takes one random
// number), the slots of the kinds it may take are shuffled (rng.shuffle) and taken from the front while they fit:
// - a slot holds one prop; a tile with a blocking prop takes nothing else
// - `gap`: no other prop with the same id within that many tiles
// - a blocking prop never goes on a wall, corridor or doorway slot, on a tile next to a door or a doorway, on a tile in
//   `keep` (link ends, spawn points ... as j * W + i), and only where every tile that could be walked to from the
//   first tile of `keep` (or the first floor tile) still can be, with the blocking props so far made solid
// - a non-blocking prop never goes on a tile with a blocking prop
// Fewer than the count are placed when the slots run out. Returns the placements in the order they were made
export function placeProps(d: TileMapData, rules: PropRule[], rng: Rng, keep: number[] = []): Placement[] {
  const { W, maps: M } = d,
    slots = slotsOf(d),
    grid = M.grid.slice(), // blocking props made solid, for the reach check
    kept = new Set(keep),
    used = new Set<string>(), // slots taken: "kind:i:j:side"
    blockedTiles = new Set<number>(),
    out: Placement[] = [];
  const from = keep.find(k => M.grid[k] === 1) ?? M.grid.indexOf(1);
  const baseline = from < 0 ? 0 : reachCount(d, grid, from);
  let reach = baseline;
  // a door on a neighbouring tile (a blocking prop there would stand in the doorway)
  const nearDoor = (k: number) => {
    const i = k % W,
      j = (k / W) | 0;
    return SIDE_STEP.some(([di, dj]) => {
      const ni = i + di,
        nj = j + dj;
      return ni >= 0 && nj >= 0 && ni < W && nj < d.H && isDoor(d, nj * W + ni);
    });
  };
  const slotKey = (s: Slot) => `${s.kind}:${s.i}:${s.j}:${s.side ?? ''}`;
  for (const rule of rules) {
    const want = Array.isArray(rule.count) ? rng.randi(rule.count[0], rule.count[1]) : rule.count;
    const cands = rng.shuffle(slots.filter(s => rule.slots.includes(s.kind)));
    let placed = 0;
    for (const s of cands) {
      if (placed >= want) break;
      const k = s.j * W + s.i;
      if (used.has(slotKey(s)) || blockedTiles.has(k)) continue;
      if (
        rule.gap &&
        out.some(p => p.id === rule.id && Math.max(Math.abs(p.slot.i - s.i), Math.abs(p.slot.j - s.j)) < rule.gap!)
      )
        continue;
      if (rule.blocks) {
        if (s.kind === 'wall' || s.kind === 'corridor' || s.kind === 'doorway') continue;
        if (k === from || kept.has(k) || nearDoor(k) || out.some(p => p.slot.i === s.i && p.slot.j === s.j)) continue;
        grid[k] = 0;
        const now = reachCount(d, grid, from);
        // the prop's own tile is the one tile allowed to drop out
        if (now < reach - 1) {
          grid[k] = 1;
          continue;
        }
        reach = now;
        blockedTiles.add(k);
      }
      used.add(slotKey(s));
      out.push({ id: rule.id, slot: s });
      placed++;
    }
  }
  return out;
}
