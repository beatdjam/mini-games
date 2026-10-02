import { clamp } from '../core/util.ts';
// engine: Tile world: grid / height / ramp maps, collision with step height, line of sight, flow field toward a target tile
// Tiles are T units wide. Each walkable tile has a floor height (hgt); ramps rise by RISE toward one side
// (ramp: 0:+x 1:-x 2:+z 3:-z, -1 = flat). Anything more than STEP above your feet blocks movement,
// so COVER_H tiles act as waist-high cover that bullets fly over.
export const T = 4,
  STEP = 0.7,
  RISE = 2;
// default heights of the tile features the generators and fixed maps build (m): a raised deck (the same as RISE, so a
// ramp up to it is level at the top) and waist-high cover
export const DECK_H = 2,
  COVER_H = 1.2;
// the four sides of a tile, numbered the same way as the ramp directions
export const SIDE_PX = 0, // +x
  SIDE_NX = 1, // -x
  SIDE_PZ = 2, // +z
  SIDE_NZ = 3; // -z
export const OPPOSITE_SIDE = [SIDE_NX, SIDE_PX, SIDE_NZ, SIDE_PZ];
// the (i, j) step to the neighbour across each side, indexed by side number
export const SIDE_STEP: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
// the tile world: empty until the game hands over a level (W = H = 0 makes every tile read as solid);
// replaced only through setTileWorld
export let W = 0; // width (tiles)
export let H = 0; // height (tiles)
export let grid: Uint8Array = new Uint8Array(0); // tile kinds
export let hgt: Float32Array = new Float32Array(0); // floor height per tile
export let ramp: Int8Array = new Int8Array(0); // ramp direction per tile (-1 = none)
export let cover: Uint8Array = new Uint8Array(0); // cover flags per tile
export let flow: Int16Array | Int32Array = new Int16Array(0); // steps to the flow target tile (-1 = unreachable)
let flowQ: Int32Array = new Int32Array(0); // scratch queue for building the flow field
export interface TileWorld {
  W: number;
  H: number;
  grid: Uint8Array;
  hgt: Float32Array;
  ramp: Int8Array;
  cover: Uint8Array;
  flow: Int16Array | Int32Array;
  flowQ: Int32Array;
}
// something that moves on the tiles; fy (feet height) is only set for movers that obey the step rule
export interface Mover {
  x: number;
  z: number;
  fy?: number;
}
// the game builds a level, then hands its maps over here (only the keys given are replaced)
export function setTileWorld(o: Partial<TileWorld>) {
  if (o.W !== undefined) W = o.W;
  if (o.H !== undefined) H = o.H;
  if (o.grid) grid = o.grid;
  if (o.hgt) hgt = o.hgt;
  if (o.ramp) ramp = o.ramp;
  if (o.cover) cover = o.cover;
  if (o.flow) flow = o.flow;
  if (o.flowQ) flowQ = o.flowQ;
}
// tile number (column i or row j) of a world coordinate
export function tileCoord(v: number): number {
  return Math.floor(v / T);
}
// is tile (i, j) inside the tile world
export function inBounds(i: number, j: number): boolean {
  return i >= 0 && j >= 0 && i < W && j < H;
}
// world coordinate of the middle of tile column i (or row j)
export function tileCenter(i: number): number {
  return (i + 0.5) * T;
}
export function isSolid(i: number, j: number): boolean {
  return !inBounds(i, j) || grid[j * W + i] !== 1;
}
export function solidAt(x: number, z: number): boolean {
  return isSolid(tileCoord(x), tileCoord(z));
}
// index into grid / hgt / flow of the tile that contains the world point (x, z); not bounds-checked
export function tileIndex(x: number, z: number): number {
  return tileCoord(z) * W + tileCoord(x);
}
export function floorY(x: number, z: number): number {
  const i = tileCoord(x),
    j = tileCoord(z);
  if (!inBounds(i, j)) return 0;
  const k = j * W + i,
    h = hgt[k],
    d = ramp[k];
  if (d < 0) return h;
  const fx = x / T - i,
    fz = z / T - j;
  return h + RISE * clamp(d === SIDE_PX ? fx : d === SIDE_NX ? 1 - fx : d === SIDE_PZ ? fz : 1 - fz, 0, 1);
}
export function blocked(x: number, z: number, r: number): boolean {
  const i0 = tileCoord(x - r),
    i1 = tileCoord(x + r),
    j0 = tileCoord(z - r),
    j1 = tileCoord(z + r);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (isSolid(i, j)) return true;
  return false;
}
// height rule for a move along one axis (sx/sz = sign of the move): only the centre and the leading edge count,
// so something half hanging over a ledge it just stepped off can still walk away from it
export function blockedDir(x: number, z: number, r: number, fy: number | undefined, sx: number, sz: number): boolean {
  if (blocked(x, z, r)) return true;
  if (fy === undefined) return false;
  const lim = fy + STEP,
    q = r * 0.7;
  if (floorY(x, z) > lim) return true;
  if (sx) return floorY(x + sx * r, z) > lim || floorY(x + sx * r, z + q) > lim || floorY(x + sx * r, z - q) > lim;
  return floorY(x, z + sz * r) > lim || floorY(x + q, z + sz * r) > lim || floorY(x - q, z + sz * r) > lim;
}
// after landing next to a higher tile, push the body out so it doesn't sit half inside the step
export function depenetrate(o: Mover & { fy: number }, r: number) {
  const lim = o.fy + STEP;
  if (floorY(o.x, o.z) > lim) return;
  if (floorY(o.x + r, o.z) > lim) o.x = tileCoord(o.x + r) * T - r - 0.01;
  if (floorY(o.x - r, o.z) > lim) o.x = (tileCoord(o.x - r) + 1) * T + r + 0.01;
  if (floorY(o.x, o.z + r) > lim) o.z = tileCoord(o.z + r) * T - r - 0.01;
  if (floorY(o.x, o.z - r) > lim) o.z = (tileCoord(o.z - r) + 1) * T + r + 0.01;
}
// o.fy (feet height) enables the height rule; bosses leave it undefined and only collide with walls
export function moveCircle(o: Mover, dx: number, dz: number, r: number): boolean {
  let hit = false;
  if (dx) {
    if (!blockedDir(o.x + dx, o.z, r, o.fy, Math.sign(dx), 0)) o.x += dx;
    else hit = true;
  }
  if (dz) {
    if (!blockedDir(o.x, o.z + dz, r, o.fy, 0, Math.sign(dz))) o.z += dz;
    else hit = true;
  }
  if (o.fy !== undefined) depenetrate(o as Mover & { fy: number }, r);
  return hit;
}
// with y0/y1 given, raised floors and cover between the two points also block the line
export function hasLOS(x0: number, z0: number, x1: number, z1: number, y0?: number, y1?: number): boolean {
  const dx = x1 - x0,
    dz = z1 - z0,
    n = Math.ceil(Math.hypot(dx, dz));
  for (let k = 1; k < n; k++) {
    const t = k / n,
      x = x0 + dx * t,
      z = z0 + dz * t;
    if (solidAt(x, z)) return false;
    if (y0 !== undefined && floorY(x, z) > y0 + ((y1 ?? y0) - y0) * t) return false;
  }
  return true;
}
export const walkable = (k: number): boolean => grid[k] === 1 && !cover[k] && ramp[k] < 0;

export function edgeH(k: number, side: number): number {
  const h = hgt[k],
    d = ramp[k];
  if (d < 0) return h;
  if (side === d) return h + RISE;
  if (side === OPPOSITE_SIDE[d]) return h;
  return h + RISE / 2;
}
// can something walk from tile a into its neighbour b across a's `side`
export function passable(a: number, b: number, side: number): boolean {
  return grid[b] === 1 && edgeH(b, OPPOSITE_SIDE[side]) - edgeH(a, side) <= STEP;
}
export function computeFlow(pi: number, pj: number) {
  flow.fill(-1);
  const s = pj * W + pi;
  if (!inBounds(pi, pj) || grid[s] !== 1) return;
  let h = 0,
    t = 0;
  flow[s] = 0;
  flowQ[t++] = s;
  while (h < t) {
    const c = flowQ[h++],
      ci = c % W,
      cj = (c / W) | 0,
      d = flow[c] + 1;
    for (let sd = 0; sd < SIDE_STEP.length; sd++) {
      const [a, b] = SIDE_STEP[sd];
      if (!inBounds(ci + a, cj + b)) continue;
      const n = c + a + b * W;
      if (grid[n] !== 1 || flow[n] >= 0) continue;
      if (!passable(n, c, OPPOSITE_SIDE[sd])) continue; // enemies walk n -> c
      flow[n] = d;
      flowQ[t++] = n;
    }
  }
}
export function flowAt(x: number, z: number): number {
  const i = tileCoord(x),
    j = tileCoord(z);
  return isSolid(i, j) ? -1 : flow[j * W + i];
}
export function flowDir(x: number, z: number): [number, number] | null {
  const i = tileCoord(x),
    j = tileCoord(z);
  if (isSolid(i, j)) return null;
  const k = j * W + i;
  let best = flow[k],
    bn = -1;
  if (best <= 0) return null;
  SIDE_STEP.forEach(([a, b], sd) => {
    const ni = i + a,
      nj = j + b;
    if (isSolid(ni, nj)) return;
    const n = nj * W + ni,
      f = flow[n];
    if (f >= 0 && f < best && passable(k, n, sd)) {
      best = f;
      bn = n;
    }
  });
  if (bn < 0) return null;
  const tx = tileCenter(bn % W) - x,
    tz = tileCenter((bn / W) | 0) - z,
    l = Math.hypot(tx, tz) || 1;
  return [tx / l, tz / l];
}
