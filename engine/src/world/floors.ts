import { OPPOSITE_SIDE, SIDE_STEP, createTileGrid, tileCenter, tileCoord } from './tiles.ts';
import type { TileGrid, TileWorld } from './tiles.ts';
// engine: A map of several floors stacked on top of each other: one TileGrid per floor, the height of each floor's
// ground, and links that join two tiles (stairs, an elevator ...). The links are only data ("these two tiles are
// connected"); when a mover uses one (walking onto stairs, after a lift's ride ...) is up to the game. The engine finds
// the way over several floors (floorFlow, flowLink) and moves a mover across a link (crossLink).

// one tile on one floor
export interface FloorSpot {
  floor: number; // index into Floors.grids
  i: number; // tile column
  j: number; // tile row
}
// two tiles that are joined, in both directions. `kind` is a word the game chooses ('stairs', 'elevator' ...); the
// engine never reads it. The two tiles may be on the same floor or on different ones
export interface FloorLink {
  kind: string;
  a: FloorSpot;
  b: FloorSpot;
}
export interface Floors {
  grids: TileGrid[]; // the terrain of each floor
  baseY: number[]; // height of each floor's ground in the world (m); the heights in a floor's maps are added to it
  links: FloorLink[]; // fixed when the floors are made (linkIndex is built from them)
  linkIndex: Map<number, FloorLink[]>[]; // per floor: tile index (j * W + i) -> the links that touch the tile
}

// "link 2 (stairs) a" and the like, so an error says which link is wrong
function linkLabel(n: number, l: FloorLink, end: 'a' | 'b'): string {
  return `createFloors: link ${n} (${l.kind}) ${end}`;
}
// throws unless `s` is a floor tile (grid = 1) inside one of the grids
function checkSpot(grids: TileGrid[], s: FloorSpot, label: string) {
  const g = grids[s.floor];
  if (!Number.isInteger(s.floor) || !g)
    throw new Error(`${label}: floor ${s.floor} does not exist (${grids.length} floors)`);
  if (!Number.isInteger(s.i) || !Number.isInteger(s.j) || !g.inBounds(s.i, s.j))
    throw new Error(`${label}: tile (${s.i}, ${s.j}) is outside floor ${s.floor} (${g.world.W} x ${g.world.H})`);
  if (!g.isFloor(s.i, s.j)) throw new Error(`${label}: tile (${s.i}, ${s.j}) on floor ${s.floor} is not a floor tile`);
}

// Builds a TileGrid for each world (the worlds are kept, not copied) and indexes the links by the tiles they touch.
// Throws, naming the link, when a link's floor does not exist or its tile is outside the map or not a floor tile;
// also throws when `baseY` does not have one height per floor
export function createFloors(worlds: TileWorld[], baseY: number[], links: FloorLink[]): Floors {
  if (baseY.length !== worlds.length)
    throw new Error(`createFloors: ${worlds.length} floors but ${baseY.length} baseY values`);
  const grids = worlds.map(createTileGrid),
    linkIndex = grids.map(() => new Map<number, FloorLink[]>());
  const add = (s: FloorSpot, l: FloorLink) => {
    const index = linkIndex[s.floor],
      k = s.j * grids[s.floor].world.W + s.i,
      list = index.get(k);
    if (list) list.push(l);
    else index.set(k, [l]);
  };
  links.forEach((l, n) => {
    checkSpot(grids, l.a, linkLabel(n, l, 'a'));
    checkSpot(grids, l.b, linkLabel(n, l, 'b'));
    add(l.a, l);
    // a link from a tile to itself is listed once
    if (l.b.floor !== l.a.floor || l.b.i !== l.a.i || l.b.j !== l.a.j) add(l.b, l);
  });
  return { grids, baseY: baseY.slice(), links: links.slice(), linkIndex };
}

// the height of the ground at (x, z) on a floor in world coordinates: the floor's baseY plus its terrain height.
// `floor` must exist (not checked)
export function feetY(f: Floors, floor: number, x: number, z: number): number {
  return f.baseY[floor] + f.grids[floor].floorY(x, z);
}

const NO_LINKS: readonly FloorLink[] = [];
// the links that touch tile (i, j) of a floor (empty for a tile with none, or outside the map). Read from the index
// made by createFloors, so it does not scan the links. Do not change the returned list
export function linksAt(f: Floors, floor: number, i: number, j: number): readonly FloorLink[] {
  const g = f.grids[floor];
  if (!g || !g.inBounds(i, j)) return NO_LINKS;
  return f.linkIndex[floor].get(j * g.world.W + i) ?? NO_LINKS;
}

// Which floor tiles can be reached on foot from `from`, going through the links as well. One Uint8Array per floor
// (index j * W + i of that floor; 1 = reachable, `from` included). A step into a neighbouring tile follows
// passable(here, neighbour, side) of the floor's grid, so a step up of more than STEP is not allowed while a drop is.
// A door is a floor tile whether it is open or shut (whoever walks there can open it).
// A link is crossed in both directions and ignores heights. Throws when `from` is not a floor tile on an existing floor
export function floorReach(f: Floors, from: FloorSpot): Uint8Array[] {
  checkSpot(f.grids, from, 'floorReach: from');
  const reach = f.grids.map(g => new Uint8Array(g.world.W * g.world.H)),
    qFloor: number[] = [],
    qTile: number[] = [];
  const visit = (floor: number, k: number) => {
    if (reach[floor][k]) return;
    reach[floor][k] = 1;
    qFloor.push(floor);
    qTile.push(k);
  };
  visit(from.floor, from.j * f.grids[from.floor].world.W + from.i);
  for (let h = 0; h < qFloor.length; h++) {
    const floor = qFloor[h],
      k = qTile[h],
      g = f.grids[floor],
      W = g.world.W,
      i = k % W,
      j = (k / W) | 0;
    // walking out of this tile: the same direction as the move, unlike computeFlow, which asks about walking toward its target
    for (let sd = 0; sd < SIDE_STEP.length; sd++) {
      const ni = i + SIDE_STEP[sd][0],
        nj = j + SIDE_STEP[sd][1];
      if (!g.inBounds(ni, nj)) continue;
      const n = nj * W + ni;
      if (!reach[floor][n] && g.passable(k, n, sd)) visit(floor, n);
    }
    for (const l of linksAt(f, floor, i, j)) {
      const to = otherEnd(l, floor, i, j);
      visit(to.floor, to.j * f.grids[to.floor].world.W + to.i);
    }
  }
  return reach;
}

// The floor tiles (grid = 1, doors included) that floorReach does not reach from `from`, floor by floor, row by row. Empty when every
// floor tile can be reached: a check for a generated map. Throws like floorReach
export function unreachableFloorTiles(f: Floors, from: FloorSpot): FloorSpot[] {
  const reach = floorReach(f, from),
    out: FloorSpot[] = [];
  f.grids.forEach((g, floor) => {
    const { W, H } = g.world;
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) if (!reach[floor][j * W + i] && g.isFloor(i, j)) out.push({ floor, i, j });
  });
  return out;
}

// ---- moving between floors: the engine finds the way and moves a mover across a link; when to cross is the game's ----

// the end of `l` that is not tile (i, j) of `floor` (for a link from a tile to itself, that tile)
export function otherEnd(l: FloorLink, floor: number, i: number, j: number): FloorSpot {
  return l.a.floor === floor && l.a.i === i && l.a.j === j ? l.b : l.a;
}

// A flow field toward `target` over every floor: each grid's world.flow becomes the steps from that tile to `target`
// (-1 = no way there), the target's own floor included. A step between neighbouring tiles follows the same rule as
// computeFlow (the direction a mover walks toward the target, doors open or shut count as floor). Crossing a link is
// one step, and only the links that `use` accepts are crossed (say, only stairs for enemies that never ride a lift).
// Every grid's flow is overwritten, the active grid's too when it is one of them. Read it with each grid's flowAt /
// flowDir as usual; at a link tile flowDir finds no closer neighbour, ask flowLink which link leads on.
// Throws when `target` is not a floor tile on an existing floor
export function floorFlow(f: Floors, target: FloorSpot, use: (l: FloorLink) => boolean) {
  checkSpot(f.grids, target, 'floorFlow: target');
  for (const g of f.grids) g.world.flow.fill(-1);
  const qFloor: number[] = [],
    qTile: number[] = [];
  const visit = (floor: number, k: number, d: number) => {
    f.grids[floor].world.flow[k] = d;
    qFloor.push(floor);
    qTile.push(k);
  };
  visit(target.floor, target.j * f.grids[target.floor].world.W + target.i, 0);
  for (let h = 0; h < qFloor.length; h++) {
    const floor = qFloor[h],
      c = qTile[h],
      g = f.grids[floor],
      { W, grid, flow } = g.world,
      i = c % W,
      j = (c / W) | 0,
      d = flow[c] + 1;
    for (let sd = 0; sd < SIDE_STEP.length; sd++) {
      const ni = i + SIDE_STEP[sd][0],
        nj = j + SIDE_STEP[sd][1];
      if (!g.inBounds(ni, nj)) continue;
      const n = nj * W + ni;
      if (grid[n] !== 1 || flow[n] >= 0) continue;
      if (g.passable(n, c, OPPOSITE_SIDE[sd])) visit(floor, n, d); // movers walk n -> c
    }
    for (const l of linksAt(f, floor, i, j)) {
      if (!use(l)) continue;
      const to = otherEnd(l, floor, i, j),
        tw = f.grids[to.floor].world,
        n = to.j * tw.W + to.i;
      if (tw.flow[n] < 0) visit(to.floor, n, d);
    }
  }
}

// After floorFlow: the link at tile (i, j) of `floor` that leads closer to the target (its other end has fewer steps
// left than this tile), among the ones `use` accepts; the closest one when several do. null when none does, or when
// the tile has no flow (out of reach, or outside the map)
export function flowLink(
  f: Floors,
  floor: number,
  i: number,
  j: number,
  use: (l: FloorLink) => boolean,
): FloorLink | null {
  const g = f.grids[floor];
  if (!g || !g.inBounds(i, j)) return null;
  let best = g.world.flow[j * g.world.W + i],
    pick: FloorLink | null = null;
  if (best <= 0) return null;
  for (const l of linksAt(f, floor, i, j)) {
    if (!use(l)) continue;
    const to = otherEnd(l, floor, i, j),
      tw = f.grids[to.floor].world,
      d = tw.flow[to.j * tw.W + to.i];
    if (d >= 0 && d < best) {
      best = d;
      pick = l;
    }
  }
  return pick;
}

// anything that walks the floors: the player, an enemy ...
export interface FloorMover {
  floor: number;
  x: number;
  z: number;
  // the tile (index j * W + i on `floor`) the mover came out on after crossing a link, until it steps off it; while
  // it stands there, crossLink does nothing, so it does not cross straight back. -1 or missing = none
  linkTile?: number;
}

// Moves `m` across a link of the tile it stands on, when there is one that `use` accepts: `m.floor` becomes the other
// end's floor and (x, z) the middle of the other end's tile; y is left to the game (feetY gives the ground there).
// Returns the link it crossed, or null. Right after a crossing it does nothing until the mover has stepped off the tile
// it came out on (see FloorMover.linkTile). With several links on the tile the first one `use` accepts is taken.
// When to call it is the game's: every frame for stairs, once a lift has done its ride, ...
export function crossLink(f: Floors, m: FloorMover, use: (l: FloorLink) => boolean): FloorLink | null {
  const g = f.grids[m.floor];
  if (!g) return null;
  const i = tileCoord(m.x),
    j = tileCoord(m.z),
    k = g.inBounds(i, j) ? j * g.world.W + i : -1;
  if (m.linkTile !== undefined && m.linkTile >= 0) {
    if (m.linkTile === k) return null;
    m.linkTile = -1;
  }
  if (k < 0) return null;
  for (const l of linksAt(f, m.floor, i, j)) {
    if (!use(l)) continue;
    const to = otherEnd(l, m.floor, i, j);
    m.floor = to.floor;
    m.x = tileCenter(to.i);
    m.z = tileCenter(to.j);
    m.linkTile = to.j * f.grids[to.floor].world.W + to.i;
    return l;
  }
  return null;
}
