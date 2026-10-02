import type { Rng } from '@engine/core/util.ts';
import { COVER_H, PLAT_H } from '../data/level.ts';
import { BOSS_META } from '../data/bosses.ts';
import type { Biome } from '../data/types.ts';
// ---- tuning numbers used only here (the per-sector numbers are in data/biomes.ts gen) ----
const GEN_MAP_SIZE = 36; // default map side (tiles)
const GEN_ROOM_COUNT: [number, number] = [5, 6]; // default number of rooms (min, max)
const GEN_ROOM_SIZE: [number, number] = [4, 7]; // default room side (min, max, tiles)
const GEN_ROOM_TRIES = 1000; // attempts to place the rooms
const ROOM_GAP = 2; // rooms keep this many tiles apart
const EXTRA_LINK_MIN_ROOMS = 4; // with more rooms than this, one extra corridor makes a loop
const BIG_ROOM = 6; // a room at least this wide and tall (tiles) can hold a platform or pillars
const PILLAR_CHANCE = 0.5; // chance a big room (without rubble) gets two pillars
const BRIDGE_MIN_LEN = 5; // shortest straight corridor run (tiles) that can become a walkway
const HAZARD_TRIES = 2000; // attempts to place the hazard floors
const ARENA_SIZE = 20,
  ARENA_FROM = 4,
  ARENA_TO = 16; // boss arena: map side, floor from tile .. to tile
// a room on the tile grid (tiles); plat = has a raised deck
export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  plat?: boolean;
}
export type LevelMaps = ReturnType<typeof newMaps>;
// what generateLevel returns: the tile maps and rooms, before anything touches the tile world or three.js
export interface GeneratedLevel {
  W: number;
  H: number;
  M: LevelMaps;
  rooms: Room[];
  startIdx: number; // room index of the start (0 in a boss arena)
}
export function newMaps(w: number, h: number) {
  return {
    g: new Uint8Array(w * h),
    hg: new Float32Array(w * h),
    rp: new Int8Array(w * h).fill(-1),
    cv: new Uint8Array(w * h),
    hz: new Uint8Array(w * h),
    ro: new Int8Array(w * h).fill(-1),
  };
}
export function genRooms(o: Record<string, any>, rng: Rng) {
  const w: number = o.map || GEN_MAP_SIZE,
    h = w,
    M = newMaps(w, h),
    g = M.g,
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
    order.push(rest.shift()!);
  }
  for (let k = 1; k < order.length; k++) corridor(order[k - 1], order[k]);
  if (order.length > EXTRA_LINK_MIN_ROOMS) corridor(order[0], order[rng.randi(2, order.length - 1)]);
  rs.forEach((r, idx) => {
    for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) M.ro[j * w + i] = idx;
  });
  rs.forEach(r => {
    const big = r.w >= BIG_ROOM && r.h >= BIG_ROOM;
    if (big && rng.next() < (o.platform || 0)) addPlatform(M, w, r);
    else if (big && !o.rubble && rng.next() < PILLAR_CHANCE) {
      const [cx, cy] = ctr(r);
      [
        [r.x + 1, r.y + 1],
        [r.x + r.w - 2, r.y + r.h - 2],
      ].forEach(([i, j]) => {
        if (i !== cx || j !== cy) g[j * w + i] = 0;
      });
    }
    if (o.rubble) addRubble(M, w, r, o.rubble, rng);
  });
  if (o.bridges) addBridges(M, w, h, o.bridges, rng);
  if (o.hazard) addHazards(M, w, h, o.hazard.count, rng);
  return { W: w, H: h, M, rooms: rs };
}
// raised deck inside the room; the outer ring stays at ground level so every doorway still connects
export function addPlatform(M: LevelMaps, w: number, r: Room) {
  for (let j = r.y + 2; j <= r.y + r.h - 2; j++)
    for (let i = r.x + 1; i <= r.x + r.w - 2; i++) M.hg[j * w + i] = PLAT_H;
  const k = (r.y + 1) * w + Math.floor(r.x + r.w / 2);
  M.rp[k] = 2;
  M.hg[k] = 0;
  r.plat = true;
}
export function addRubble(M: LevelMaps, w: number, r: Room, rate: number, rng: Rng) {
  const cx = Math.floor(r.x + r.w / 2),
    cy = Math.floor(r.y + r.h / 2);
  for (let j = r.y + 1; j <= r.y + r.h - 2; j++)
    for (let i = r.x + 1; i <= r.x + r.w - 2; i++) {
      const k = j * w + i;
      if ((i === cx && j === cy) || M.hg[k] > 0 || M.rp[k] >= 0 || rng.next() > rate) continue;
      let ok = true;
      for (let dj = -1; dj <= 1 && ok; dj++)
        for (let di = -1; di <= 1; di++) {
          const n = (j + dj) * w + i + di;
          if (M.cv[n] || M.rp[n] >= 0 || M.hg[n] > 0) {
            ok = false;
            break;
          }
        }
      if (ok) {
        M.cv[k] = 1;
        M.hg[k] = COVER_H;
      }
    }
}
// straight 1-wide corridor runs (walls on both sides) become raised walkways with a ramp at each end
export function addBridges(M: LevelMaps, w: number, h: number, count: number, rng: Rng) {
  const g = M.g,
    free = (k: number) => g[k] === 1 && M.ro[k] < 0 && M.hg[k] === 0 && M.rp[k] < 0 && !M.cv[k] && !M.hz[k];
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
      M.rp[K(r.a)] = r.hor ? 0 : 2;
      M.rp[K(r.b)] = r.hor ? 1 : 3;
      for (let t = r.a + 1; t < r.b; t++) M.hg[K(t)] = PLAT_H;
    });
}
export function addHazards(M: LevelMaps, w: number, h: number, count: number, rng: Rng) {
  let placed = 0,
    tries = 0;
  while (placed < count && tries++ < HAZARD_TRIES) {
    const i = rng.randi(1, w - 2),
      j = rng.randi(1, h - 2),
      k = j * w + i;
    if (M.g[k] !== 1 || M.hg[k] !== 0 || M.rp[k] >= 0 || M.cv[k] || M.hz[k]) continue;
    M.hz[k] = 1;
    placed++;
  }
}
export function genArena(withPillars: boolean) {
  const w = ARENA_SIZE,
    h = ARENA_SIZE,
    M = newMaps(w, h);
  for (let j = ARENA_FROM; j < ARENA_TO; j++) for (let i = ARENA_FROM; i < ARENA_TO; i++) M.g[j * w + i] = 1;
  if (withPillars)
    [
      [6, 6],
      [13, 6],
      [6, 13],
      [13, 13],
    ].forEach(([i, j]) => {
      M.g[j * w + i] = 0;
    });
  return {
    W: w,
    H: h,
    M,
    rooms: [{ x: ARENA_FROM, y: ARENA_FROM, w: ARENA_TO - ARENA_FROM, h: ARENA_TO - ARENA_FROM }],
  };
}

// Everything random in generation draws from rng, so the same seed gives the same level.
export function generateLevel(
  biome: Biome,
  isArena: boolean,
  bossKind: string | null | undefined,
  rng: Rng,
): GeneratedLevel {
  const gen = isArena ? genArena(BOSS_META[bossKind!].pillars) : genRooms(biome.gen, rng);
  let startIdx = 0;
  // the start room: none in it or its doorways, so the first steps of an area can't land on a hazard floor (the
  // spot is the room's middle, so a hazard there put the player right next to others)
  if (!isArena) {
    startIdx = rng.randi(0, gen.rooms.length - 1);
    const R = gen.rooms[startIdx]!;
    for (let j = R.y - 1; j <= R.y + R.h; j++)
      for (let i = R.x - 1; i <= R.x + R.w; i++)
        if (i >= 0 && j >= 0 && i < gen.W && j < gen.H) gen.M.hz[j * gen.W + i] = 0;
  }
  return { W: gen.W, H: gen.H, M: gen.M, rooms: gen.rooms, startIdx };
}
