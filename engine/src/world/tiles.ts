import { clamp } from '../core/util.ts';
// engine: Tile world: grid / height / ramp maps, collision with step height, line of sight, flow field toward a target tile.
// A tile world is a TileGrid object (createTileGrid); the module-level functions work on the active one
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
// the maps of one tile world; the engine reads them (never replaces them), so the owner may keep filling the same arrays
export interface TileWorld {
  W: number; // width (tiles)
  H: number; // height (tiles)
  grid: Uint8Array; // tile kinds
  hgt: Float32Array; // floor height per tile
  ramp: Int8Array; // ramp direction per tile (-1 = none)
  cover: Uint8Array; // cover flags per tile
  flow: Int16Array | Int32Array; // steps to the flow target tile (-1 = unreachable)
  flowQ: Int32Array; // scratch queue for building the flow field
}
// something that moves on the tiles; fy (feet height) is only set for movers that obey the step rule
export interface Mover {
  x: number;
  z: number;
  fy?: number;
}
// one tile world as an object: the functions that read the terrain, bound to the maps of the TileWorld it was made from.
// Several can exist side by side (one per floor, say) and they do not affect each other. The module-level functions of
// the same names work on the active one (activeTileGrid)
export interface TileGrid {
  readonly world: TileWorld; // the maps the methods read; a field set here is seen by the next call
  inBounds(i: number, j: number): boolean;
  isSolid(i: number, j: number): boolean;
  solidAt(x: number, z: number): boolean;
  // index into grid / hgt / flow of the tile that contains the world point (x, z); not bounds-checked
  tileIndex(x: number, z: number): number;
  floorY(x: number, z: number): number;
  blocked(x: number, z: number, r: number): boolean;
  // height rule for a move along one axis (sx/sz = sign of the move): only the centre and the leading edge count,
  // so something half hanging over a ledge it just stepped off can still walk away from it
  blockedDir(x: number, z: number, r: number, fy: number | undefined, sx: number, sz: number): boolean;
  // after landing next to a higher tile, push the body out so it doesn't sit half inside the step
  depenetrate(o: Mover & { fy: number }, r: number): void;
  // o.fy (feet height) enables the height rule; bosses leave it undefined and only collide with walls
  moveCircle(o: Mover, dx: number, dz: number, r: number): boolean;
  // with y0/y1 given, raised floors and cover between the two points also block the line
  hasLOS(x0: number, z0: number, x1: number, z1: number, y0?: number, y1?: number): boolean;
  walkable(k: number): boolean;
  edgeH(k: number, side: number): number;
  // can something walk from tile a into its neighbour b across a's `side`
  passable(a: number, b: number, side: number): boolean;
  // fills world.flow with the steps to tile (pi, pj)
  computeFlow(pi: number, pj: number): void;
  flowAt(x: number, z: number): number;
  flowDir(x: number, z: number): [number, number] | null;
}
// makes the object for one tile world. It keeps `world` itself, not a copy
export function createTileGrid(world: TileWorld): TileGrid {
  function inBounds(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < world.W && j < world.H;
  }
  function isSolid(i: number, j: number): boolean {
    return !inBounds(i, j) || world.grid[j * world.W + i] !== 1;
  }
  function solidAt(x: number, z: number): boolean {
    return isSolid(tileCoord(x), tileCoord(z));
  }
  function tileIndex(x: number, z: number): number {
    return tileCoord(z) * world.W + tileCoord(x);
  }
  function floorY(x: number, z: number): number {
    const i = tileCoord(x),
      j = tileCoord(z);
    if (!inBounds(i, j)) return 0;
    const k = j * world.W + i,
      h = world.hgt[k],
      d = world.ramp[k];
    if (d < 0) return h;
    const fx = x / T - i,
      fz = z / T - j;
    return h + RISE * clamp(d === SIDE_PX ? fx : d === SIDE_NX ? 1 - fx : d === SIDE_PZ ? fz : 1 - fz, 0, 1);
  }
  function blocked(x: number, z: number, r: number): boolean {
    const i0 = tileCoord(x - r),
      i1 = tileCoord(x + r),
      j0 = tileCoord(z - r),
      j1 = tileCoord(z + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (isSolid(i, j)) return true;
    return false;
  }
  function blockedDir(x: number, z: number, r: number, fy: number | undefined, sx: number, sz: number): boolean {
    if (blocked(x, z, r)) return true;
    if (fy === undefined) return false;
    const lim = fy + STEP,
      q = r * 0.7;
    if (floorY(x, z) > lim) return true;
    if (sx) return floorY(x + sx * r, z) > lim || floorY(x + sx * r, z + q) > lim || floorY(x + sx * r, z - q) > lim;
    return floorY(x, z + sz * r) > lim || floorY(x + q, z + sz * r) > lim || floorY(x - q, z + sz * r) > lim;
  }
  function depenetrate(o: Mover & { fy: number }, r: number) {
    const lim = o.fy + STEP;
    if (floorY(o.x, o.z) > lim) return;
    if (floorY(o.x + r, o.z) > lim) o.x = tileCoord(o.x + r) * T - r - 0.01;
    if (floorY(o.x - r, o.z) > lim) o.x = (tileCoord(o.x - r) + 1) * T + r + 0.01;
    if (floorY(o.x, o.z + r) > lim) o.z = tileCoord(o.z + r) * T - r - 0.01;
    if (floorY(o.x, o.z - r) > lim) o.z = (tileCoord(o.z - r) + 1) * T + r + 0.01;
  }
  function moveCircle(o: Mover, dx: number, dz: number, r: number): boolean {
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
  function hasLOS(x0: number, z0: number, x1: number, z1: number, y0?: number, y1?: number): boolean {
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
  const walkable = (k: number): boolean => world.grid[k] === 1 && !world.cover[k] && world.ramp[k] < 0;
  function edgeH(k: number, side: number): number {
    const h = world.hgt[k],
      d = world.ramp[k];
    if (d < 0) return h;
    if (side === d) return h + RISE;
    if (side === OPPOSITE_SIDE[d]) return h;
    return h + RISE / 2;
  }
  function passable(a: number, b: number, side: number): boolean {
    return world.grid[b] === 1 && edgeH(b, OPPOSITE_SIDE[side]) - edgeH(a, side) <= STEP;
  }
  function computeFlow(pi: number, pj: number) {
    const { W, grid, flow, flowQ } = world;
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
  function flowAt(x: number, z: number): number {
    const i = tileCoord(x),
      j = tileCoord(z);
    return isSolid(i, j) ? -1 : world.flow[j * world.W + i];
  }
  function flowDir(x: number, z: number): [number, number] | null {
    const { W, flow } = world,
      i = tileCoord(x),
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
  return {
    world,
    inBounds,
    isSolid,
    solidAt,
    tileIndex,
    floorY,
    blocked,
    blockedDir,
    depenetrate,
    moveCircle,
    hasLOS,
    walkable,
    edgeH,
    passable,
    computeFlow,
    flowAt,
    flowDir,
  };
}
// the tile world the module-level functions work on: empty until the game hands over a level (W = H = 0 makes every
// tile read as solid); replaced only through setTileWorld
const activeWorld: TileWorld = {
  W: 0,
  H: 0,
  grid: new Uint8Array(0),
  hgt: new Float32Array(0),
  ramp: new Int8Array(0),
  cover: new Uint8Array(0),
  flow: new Int16Array(0),
  flowQ: new Int32Array(0),
};
const active = createTileGrid(activeWorld);
// the active tile world as an object (the same one for the whole run; setTileWorld changes its maps)
export function activeTileGrid(): TileGrid {
  return active;
}
// live copies of the active maps, for the files that read them directly; set only in setTileWorld
export let W = activeWorld.W; // width (tiles)
export let H = activeWorld.H; // height (tiles)
export let grid: Uint8Array = activeWorld.grid; // tile kinds
export let hgt: Float32Array = activeWorld.hgt; // floor height per tile
export let ramp: Int8Array = activeWorld.ramp; // ramp direction per tile (-1 = none)
export let cover: Uint8Array = activeWorld.cover; // cover flags per tile
export let flow: Int16Array | Int32Array = activeWorld.flow; // steps to the flow target tile (-1 = unreachable)
// the game builds a level, then hands its maps over here (only the keys given are replaced)
export function setTileWorld(o: Partial<TileWorld>) {
  if (o.W !== undefined) {
    activeWorld.W = o.W;
    W = o.W;
  }
  if (o.H !== undefined) {
    activeWorld.H = o.H;
    H = o.H;
  }
  if (o.grid) {
    activeWorld.grid = o.grid;
    grid = o.grid;
  }
  if (o.hgt) {
    activeWorld.hgt = o.hgt;
    hgt = o.hgt;
  }
  if (o.ramp) {
    activeWorld.ramp = o.ramp;
    ramp = o.ramp;
  }
  if (o.cover) {
    activeWorld.cover = o.cover;
    cover = o.cover;
  }
  if (o.flow) {
    activeWorld.flow = o.flow;
    flow = o.flow;
  }
  if (o.flowQ) activeWorld.flowQ = o.flowQ;
}
// tile number (column i or row j) of a world coordinate
export function tileCoord(v: number): number {
  return Math.floor(v / T);
}
// world coordinate of the middle of tile column i (or row j)
export function tileCenter(i: number): number {
  return (i + 0.5) * T;
}
// the functions below work on the active tile world (see TileGrid for what each one does)
// is tile (i, j) inside the tile world
export function inBounds(i: number, j: number): boolean {
  return active.inBounds(i, j);
}
export function isSolid(i: number, j: number): boolean {
  return active.isSolid(i, j);
}
export function solidAt(x: number, z: number): boolean {
  return active.solidAt(x, z);
}
// index into grid / hgt / flow of the tile that contains the world point (x, z); not bounds-checked
export function tileIndex(x: number, z: number): number {
  return active.tileIndex(x, z);
}
export function floorY(x: number, z: number): number {
  return active.floorY(x, z);
}
export function blocked(x: number, z: number, r: number): boolean {
  return active.blocked(x, z, r);
}
export function blockedDir(x: number, z: number, r: number, fy: number | undefined, sx: number, sz: number): boolean {
  return active.blockedDir(x, z, r, fy, sx, sz);
}
export function depenetrate(o: Mover & { fy: number }, r: number) {
  active.depenetrate(o, r);
}
// o.fy (feet height) enables the height rule; bosses leave it undefined and only collide with walls
export function moveCircle(o: Mover, dx: number, dz: number, r: number): boolean {
  return active.moveCircle(o, dx, dz, r);
}
// with y0/y1 given, raised floors and cover between the two points also block the line
export function hasLOS(x0: number, z0: number, x1: number, z1: number, y0?: number, y1?: number): boolean {
  return active.hasLOS(x0, z0, x1, z1, y0, y1);
}
export const walkable = (k: number): boolean => active.walkable(k);
export function edgeH(k: number, side: number): number {
  return active.edgeH(k, side);
}
// can something walk from tile a into its neighbour b across a's `side`
export function passable(a: number, b: number, side: number): boolean {
  return active.passable(a, b, side);
}
export function computeFlow(pi: number, pj: number) {
  active.computeFlow(pi, pj);
}
export function flowAt(x: number, z: number): number {
  return active.flowAt(x, z);
}
export function flowDir(x: number, z: number): [number, number] | null {
  return active.flowDir(x, z);
}
