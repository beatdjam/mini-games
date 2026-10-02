import type { Rng } from '../core/util.ts';
import { COVER_H, DECK_H } from './tiles.ts';
// engine: Grid dungeon generation: rooms joined by corridors, then optional passes (raised decks, rubble, bridges).
// Everything random draws from the rng you pass, so the same seed gives the same dungeon. No three.js, no DOM.
// The maps use the same encoding as the tile world (world/tiles.ts), so they can go straight into setTileWorld.
// ---- tuning numbers used only here ----
const GEN_MAP_SIZE = 36; // default map side (tiles)
const GEN_ROOM_COUNT: [number, number] = [5, 6]; // default number of rooms (min, max)
const GEN_ROOM_SIZE: [number, number] = [4, 7]; // default room side (min, max, tiles)
const GEN_ROOM_TRIES = 1000; // attempts to place the rooms
const ROOM_GAP = 2; // rooms keep this many tiles apart
const EXTRA_LINK_MIN_ROOMS = 4; // with more rooms than this, one extra corridor makes a loop
const BIG_ROOM = 6; // a room at least this wide and tall (tiles) can hold a deck or pillars
const PILLAR_CHANCE = 0.5; // chance a big room (without rubble) gets two pillars
const BRIDGE_MIN_LEN = 5; // shortest straight corridor run (tiles) that can become a walkway

// a room on the tile grid (tiles); plat = has a raised deck
export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  plat?: boolean;
}
// the per-tile maps of a level, indexed j * W + i (grid: 1 = floor, 0 = wall; the others as in world/tiles.ts)
export interface TileMaps {
  grid: Uint8Array;
  hgt: Float32Array;
  ramp: Int8Array; // -1 = flat
  cover: Uint8Array;
  roomOf: Int8Array; // index of the room the tile is in (-1 = none)
}
export interface TileMapData {
  W: number;
  H: number;
  maps: TileMaps;
  rooms: Room[];
}
// every field is optional; a missing (or 0) one takes the default
export interface DungeonOptions {
  map?: number; // map side (tiles)
  countMin?: number; // number of rooms
  countMax?: number;
  roomMin?: number; // room side (tiles)
  roomMax?: number;
  corridorW?: number; // corridor width (tiles)
  platform?: number; // chance a big room gets a raised deck
  rubble?: number; // chance per tile of cover in a room (rooms with rubble get no pillars)
  bridges?: number; // how many straight corridor runs become raised walkways
  deckH?: number; // height of decks and walkways (m)
  coverH?: number; // height of cover (m)
}

export function newTileMaps(w: number, h: number): TileMaps {
  return {
    grid: new Uint8Array(w * h),
    hgt: new Float32Array(w * h),
    ramp: new Int8Array(w * h).fill(-1),
    cover: new Uint8Array(w * h),
    roomOf: new Int8Array(w * h).fill(-1),
  };
}

// Places rooms, links them with corridors (nearest-first order plus one loop), then runs the passes the options ask
// for. The random numbers are drawn in a fixed order: rooms, corridors, per room (deck or pillars, rubble), bridges.
export function generateDungeon(o: DungeonOptions, rng: Rng): TileMapData {
  const w = o.map || GEN_MAP_SIZE,
    h = w,
    maps = newTileMaps(w, h),
    g = maps.grid,
    rs: Room[] = [];
  const target = rng.randi(o.countMin || GEN_ROOM_COUNT[0], o.countMax || GEN_ROOM_COUNT[1]),
    rmin = o.roomMin || GEN_ROOM_SIZE[0],
    rmax = o.roomMax || GEN_ROOM_SIZE[1],
    cw = o.corridorW || 1;
  let tries = 0;
  while (rs.length < target && tries++ < GEN_ROOM_TRIES) {
    const rw = rng.randi(rmin, rmax),
      rh = rng.randi(rmin, rmax),
      x = rng.randi(1, w - rw - 1),
      y = rng.randi(1, h - rh - 1);
    if (
      rs.some(
        q => x < q.x + q.w + ROOM_GAP && x + rw + ROOM_GAP > q.x && y < q.y + q.h + ROOM_GAP && y + rh + ROOM_GAP > q.y,
      )
    )
      continue;
    rs.push({ x, y, w: rw, h: rh });
  }
  const carve = (i: number, j: number) => {
    for (let a = 0; a < cw; a++)
      for (let b = 0; b < cw; b++) {
        const x = i + a,
          y = j + b;
        if (x > 0 && y > 0 && x < w - 1 && y < h - 1) g[y * w + x] = 1;
      }
  };
  rs.forEach(r => {
    for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) g[j * w + i] = 1;
  });
  const ctr = (r: Room) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
  const corridor = (a: Room, b: Room) => {
    let [x, y] = ctr(a);
    const [tx, ty] = ctr(b);
    const sx = () => {
      while (x !== tx) {
        carve(x, y);
        x += Math.sign(tx - x);
      }
    };
    const sy = () => {
      while (y !== ty) {
        carve(x, y);
        y += Math.sign(ty - y);
      }
    };
    if (rng.next() < 0.5) {
      sx();
      sy();
    } else {
      sy();
      sx();
    }
    carve(x, y);
  };
  const order = [rs[0]],
    rest = rs.slice(1);
  const dist = (a: Room, b: Room) => Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2);
  while (rest.length) {
    const last = order[order.length - 1];
    rest.sort((a, b) => dist(a, last) - dist(b, last));
    order.push(rest.shift()!); // the loop condition says rest is not empty
  }
  for (let k = 1; k < order.length; k++) corridor(order[k - 1], order[k]);
  if (order.length > EXTRA_LINK_MIN_ROOMS) corridor(order[0], order[rng.randi(2, order.length - 1)]);
  rs.forEach((r, idx) => {
    for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) maps.roomOf[j * w + i] = idx;
  });
  rs.forEach(r => {
    const big = r.w >= BIG_ROOM && r.h >= BIG_ROOM;
    if (big && rng.next() < (o.platform || 0)) addPlatform(maps, w, r, o.deckH);
    else if (big && !o.rubble && rng.next() < PILLAR_CHANCE) {
      const [cx, cy] = ctr(r);
      [
        [r.x + 1, r.y + 1],
        [r.x + r.w - 2, r.y + r.h - 2],
      ].forEach(([i, j]) => {
        if (i !== cx || j !== cy) g[j * w + i] = 0;
      });
    }
    if (o.rubble) addRubble(maps, w, r, o.rubble, rng, o.coverH);
  });
  if (o.bridges) addBridges(maps, w, h, o.bridges, rng, o.deckH);
  return { W: w, H: h, maps, rooms: rs };
}

// An open square arena: floor from tile `from` up to (not including) `to`, plus walls on the `pillars` tiles ([i, j]).
// The one room covers the floor (roomOf stays -1 everywhere). No random numbers.
export function generateArena(size: number, from: number, to: number, pillars: [number, number][]): TileMapData {
  const maps = newTileMaps(size, size);
  for (let j = from; j < to; j++) for (let i = from; i < to; i++) maps.grid[j * size + i] = 1;
  pillars.forEach(([i, j]) => {
    maps.grid[j * size + i] = 0;
  });
  return { W: size, H: size, maps, rooms: [{ x: from, y: from, w: to - from, h: to - from }] };
}

// raised deck inside the room; the outer ring stays at ground level so every doorway still connects
export function addPlatform(maps: TileMaps, w: number, r: Room, deckH = DECK_H) {
  for (let j = r.y + 2; j <= r.y + r.h - 2; j++)
    for (let i = r.x + 1; i <= r.x + r.w - 2; i++) maps.hgt[j * w + i] = deckH;
  const k = (r.y + 1) * w + Math.floor(r.x + r.w / 2);
  maps.ramp[k] = 2;
  maps.hgt[k] = 0;
  r.plat = true;
}
// waist-high cover scattered in the room (rate = chance per tile); never on the middle, next to other cover or on a deck
export function addRubble(maps: TileMaps, w: number, r: Room, rate: number, rng: Rng, coverH = COVER_H) {
  const cx = Math.floor(r.x + r.w / 2),
    cy = Math.floor(r.y + r.h / 2);
  for (let j = r.y + 1; j <= r.y + r.h - 2; j++)
    for (let i = r.x + 1; i <= r.x + r.w - 2; i++) {
      const k = j * w + i;
      if ((i === cx && j === cy) || maps.hgt[k] > 0 || maps.ramp[k] >= 0 || rng.next() > rate) continue;
      let ok = true;
      for (let dj = -1; dj <= 1 && ok; dj++)
        for (let di = -1; di <= 1; di++) {
          const n = (j + dj) * w + i + di;
          if (maps.cover[n] || maps.ramp[n] >= 0 || maps.hgt[n] > 0) {
            ok = false;
            break;
          }
        }
      if (ok) {
        maps.cover[k] = 1;
        maps.hgt[k] = coverH;
      }
    }
}
// straight 1-wide corridor runs (walls on both sides) become raised walkways with a ramp at each end
export function addBridges(maps: TileMaps, w: number, h: number, count: number, rng: Rng, deckH = DECK_H) {
  const g = maps.grid,
    free = (k: number) => g[k] === 1 && maps.roomOf[k] < 0 && maps.hgt[k] === 0 && maps.ramp[k] < 0 && !maps.cover[k];
  const runs: { hor: boolean; a: number; b: number; c: number }[] = [];
  for (let j = 1; j < h - 1; j++) {
    let i0 = -1;
    for (let i = 1; i < w; i++) {
      const k = j * w + i,
        ok = i < w - 1 && free(k) && !g[k - w] && !g[k + w];
      if (ok && i0 < 0) i0 = i;
      if (!ok && i0 >= 0) {
        if (i - i0 >= BRIDGE_MIN_LEN) runs.push({ hor: true, a: i0, b: i - 1, c: j });
        i0 = -1;
      }
    }
  }
  for (let i = 1; i < w - 1; i++) {
    let j0 = -1;
    for (let j = 1; j < h; j++) {
      const k = j * w + i,
        ok = j < h - 1 && free(k) && !g[k - 1] && !g[k + 1];
      if (ok && j0 < 0) j0 = j;
      if (!ok && j0 >= 0) {
        if (j - j0 >= BRIDGE_MIN_LEN) runs.push({ hor: false, a: j0, b: j - 1, c: i });
        j0 = -1;
      }
    }
  }
  rng
    .shuffle(runs)
    .slice(0, count)
    .forEach(r => {
      const K = (t: number) => (r.hor ? r.c * w + t : t * w + r.c);
      maps.ramp[K(r.a)] = r.hor ? 0 : 2;
      maps.ramp[K(r.b)] = r.hor ? 1 : 3;
      for (let t = r.a + 1; t < r.b; t++) maps.hgt[K(t)] = deckH;
    });
}
