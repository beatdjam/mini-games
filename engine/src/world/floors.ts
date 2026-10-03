import { SIDE_STEP, createTileGrid } from './tiles.ts';
import type { TileGrid, TileWorld } from './tiles.ts';
// engine: A map of several floors stacked on top of each other: one TileGrid per floor, the height of each floor's
// ground, and links that join two tiles (stairs, an elevator ...). The links are only data ("these two tiles are
// connected"); how a mover uses one (when it moves, how its floor changes) is up to the game.

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
  if (g.isSolid(s.i, s.j)) throw new Error(`${label}: tile (${s.i}, ${s.j}) on floor ${s.floor} is not a floor tile`);
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
      const here = l.a.floor === floor && l.a.i === i && l.a.j === j,
        to = here ? l.b : l.a;
      visit(to.floor, to.j * f.grids[to.floor].world.W + to.i);
    }
  }
  return reach;
}

// The floor tiles (grid = 1) that floorReach does not reach from `from`, floor by floor, row by row. Empty when every
// floor tile can be reached: a check for a generated map. Throws like floorReach
export function unreachableFloorTiles(f: Floors, from: FloorSpot): FloorSpot[] {
  const reach = floorReach(f, from),
    out: FloorSpot[] = [];
  f.grids.forEach((g, floor) => {
    const { W, H } = g.world;
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) if (!reach[floor][j * W + i] && !g.isSolid(i, j)) out.push({ floor, i, j });
  });
  return out;
}
