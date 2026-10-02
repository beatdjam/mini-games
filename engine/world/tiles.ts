import { clamp } from '../core/util.ts';
// engine: Tile world: grid / height / ramp maps, collision with step height, line of sight, flow field toward a target tile
// Tiles are T units wide. Each walkable tile has a floor height (hgt); ramps rise by RISE toward one side
// (ramp: 0:+x 1:-x 2:+z 3:-z, -1 = flat). Anything more than STEP above your feet blocks movement,
// so COVER_H tiles act as waist-high cover that bullets fly over.
export const T = 4,
  STEP = 0.7,
  RISE = 2;
export const OPP = [1, 0, 3, 2];
// empty until the game hands over a level (W = H = 0 makes every tile read as solid)
export let W = 0,
  H = 0;
export let grid: Uint8Array = new Uint8Array(0),
  hgt: Float32Array = new Float32Array(0),
  ramp: Int8Array = new Int8Array(0),
  cover: Uint8Array = new Uint8Array(0);
export let flow: Int16Array | Int32Array = new Int16Array(0),
  flowQ: Int32Array = new Int32Array(0);
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
export function isSolid(i: number, j: number): boolean {
  return i < 0 || j < 0 || i >= W || j >= H || grid[j * W + i] !== 1;
}
export function solidAt(x: number, z: number): boolean {
  return isSolid(Math.floor(x / T), Math.floor(z / T));
}
// index into grid / hgt / flow of the tile that contains the world point (x, z); not bounds-checked
export function tileIndex(x: number, z: number): number {
  return Math.floor(z / T) * W + Math.floor(x / T);
}
export function floorY(x: number, z: number): number {
  const i = Math.floor(x / T),
    j = Math.floor(z / T);
  if (i < 0 || j < 0 || i >= W || j >= H) return 0;
  const k = j * W + i,
    h = hgt[k],
    d = ramp[k];
  if (d < 0) return h;
  const fx = x / T - i,
    fz = z / T - j;
  return h + RISE * clamp(d === 0 ? fx : d === 1 ? 1 - fx : d === 2 ? fz : 1 - fz, 0, 1);
}
export function blocked(x: number, z: number, r: number): boolean {
  const i0 = Math.floor((x - r) / T),
    i1 = Math.floor((x + r) / T),
    j0 = Math.floor((z - r) / T),
    j1 = Math.floor((z + r) / T);
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
  if (floorY(o.x + r, o.z) > lim) o.x = Math.floor((o.x + r) / T) * T - r - 0.01;
  if (floorY(o.x - r, o.z) > lim) o.x = (Math.floor((o.x - r) / T) + 1) * T + r + 0.01;
  if (floorY(o.x, o.z + r) > lim) o.z = Math.floor((o.z + r) / T) * T - r - 0.01;
  if (floorY(o.x, o.z - r) > lim) o.z = (Math.floor((o.z - r) / T) + 1) * T + r + 0.01;
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
  if (side === OPP[d]) return h;
  return h + RISE / 2;
}
// can something walk from tile a into its neighbour b across a's `side`
export function passable(a: number, b: number, side: number): boolean {
  return grid[b] === 1 && edgeH(b, OPP[side]) - edgeH(a, side) <= STEP;
}
export function computeFlow(pi: number, pj: number) {
  flow.fill(-1);
  const s = pj * W + pi;
  if (pi < 0 || pj < 0 || pi >= W || pj >= H || grid[s] !== 1) return;
  let h = 0,
    t = 0;
  flow[s] = 0;
  flowQ[t++] = s;
  while (h < t) {
    const c = flowQ[h++],
      ci = c % W,
      cj = (c / W) | 0,
      d = flow[c] + 1;
    const nb = [ci < W - 1 ? c + 1 : -1, ci > 0 ? c - 1 : -1, cj < H - 1 ? c + W : -1, cj > 0 ? c - W : -1];
    for (let sd = 0; sd < 4; sd++) {
      const n = nb[sd];
      if (n < 0 || grid[n] !== 1 || flow[n] >= 0) continue;
      if (!passable(n, c, OPP[sd])) continue; // enemies walk n -> c
      flow[n] = d;
      flowQ[t++] = n;
    }
  }
}
export function flowAt(x: number, z: number): number {
  const i = Math.floor(x / T),
    j = Math.floor(z / T);
  return isSolid(i, j) ? -1 : flow[j * W + i];
}
export function flowDir(x: number, z: number): [number, number] | null {
  const i = Math.floor(x / T),
    j = Math.floor(z / T);
  if (isSolid(i, j)) return null;
  const k = j * W + i;
  let best = flow[k],
    bn = -1;
  if (best <= 0) return null;
  [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].forEach(([a, b], sd) => {
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
  const tx = ((bn % W) + 0.5) * T - x,
    tz = (((bn / W) | 0) + 0.5) * T - z,
    l = Math.hypot(tx, tz) || 1;
  return [tx / l, tz / l];
}
