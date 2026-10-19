import type { OutsideBlock, OutsideCard } from '@engine/render/windows.ts';
import type { Rng } from '@engine/core/util.ts';
import { SIDE_STEP, T } from '@engine/world/tiles.ts';
// The buildings across the street from the windows one sees out of (Look.outside.blocks). They stand round the
// building, wherever its outside wall is (the floors' outline can lie well inside the map, and not square): every
// tile is measured by how far it is from the building (from the nearest tile that is floor, or open, on any floor),
// and the ground is cut into squares of BLOCK_TILES tiles. A square past STREET tiles of street, out to NEAR_TO, is a block of the
// near row, one further out to FAR_TO one of the rows behind (taller); one in a few is left empty (a gap, a lot);
// further out there is only the backdrop. Of each block only the roof and the faces that can be seen from the
// building are built: not a face turned away from all of it, nor one with a block as high or higher against it. How high
// they stand and the light on each face are the sector's (BlockStyle). Built with buildOutsideBlocks
// (engine/src/render/windows.ts), in the frame where the street is at y 0.
// ---- tuning numbers used only here ----
const BLOCK_TILES = 4; // a block is a square this many tiles a side (16 m)
const STREET = 5; // tiles of street between the building and the near row (20 m: the block nearest is 6 out)
const NEAR_TO = 12; // the near row: a block whose nearest tile is this far out or less (tiles)
const FAR_TO = 30; // the rows behind it, out to here (tiles)
const EMPTY = 0.12; // the share of the squares left empty
const MARGIN = FAR_TO + BLOCK_TILES; // tiles measured round the map

// what a sector's blocks are like: how high the near row and the row behind stand (m), how many facade and roof
// pictures there are
export interface BlockStyle {
  high: [[number, number], [number, number]];
  facades: number;
  roofs: number;
}

// how far each tile of the map and round it (MARGIN tiles more on every side: ew by eh) is from the building (tiles,
// the 8 neighbours one step)
function farFrom(inside: Uint8Array, w: number, h: number): { far: Uint16Array; ew: number; eh: number } {
  const ew = w + 2 * MARGIN,
    eh = h + 2 * MARGIN,
    far = new Uint16Array(ew * eh).fill(0xffff),
    queue: number[] = [];
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      if (inside[j * w + i]) {
        const k = (j + MARGIN) * ew + i + MARGIN;
        far[k] = 0;
        queue.push(k);
      }
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q]!,
      i = k % ew,
      j = (k / ew) | 0;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ni = i + di,
          nj = j + dj,
          n = nj * ew + ni;
        if (ni < 0 || nj < 0 || ni >= ew || nj >= eh || far[n]! <= far[k]! + 1) continue;
        far[n] = far[k]! + 1;
        queue.push(n);
      }
  }
  return { far, ew, eh };
}

// the blocks round a building on a map w by h tiles whose floors are on the tiles of `inside` (1: floor or open on
// some floor); the same rng gives the same blocks
export function outsideBlocks(inside: Uint8Array, w: number, h: number, style: BlockStyle, rng: Rng): OutsideBlock[] {
  const { far, ew, eh } = farFrom(inside, w, h);
  // the building's extent (m)
  const box = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  inside.forEach((v, k) => {
    if (!v) return;
    box.x0 = Math.min(box.x0, (k % w) * T);
    box.x1 = Math.max(box.x1, ((k % w) + 1) * T);
    box.z0 = Math.min(box.z0, Math.floor(k / w) * T);
    box.z1 = Math.max(box.z1, (Math.floor(k / w) + 1) * T);
  });
  // the squares: a height for each that is a block (0: none), by how far its nearest tile is
  const cw = Math.floor(ew / BLOCK_TILES),
    ch = Math.floor(eh / BLOCK_TILES),
    top = new Float32Array(cw * ch);
  for (let cj = 0; cj < ch; cj++)
    for (let ci = 0; ci < cw; ci++) {
      let d = 0xffff;
      for (let j = 0; j < BLOCK_TILES; j++)
        for (let i = 0; i < BLOCK_TILES; i++) d = Math.min(d, far[(cj * BLOCK_TILES + j) * ew + ci * BLOCK_TILES + i]!);
      const c = cj * cw + ci;
      if (d <= STREET || d > FAR_TO || rng.next() < EMPTY) continue;
      top[c] = rng.rand(...style.high[d <= NEAR_TO ? 0 : 1]);
    }
  const out: OutsideBlock[] = [];
  for (let cj = 0; cj < ch; cj++)
    for (let ci = 0; ci < cw; ci++) {
      const c = cj * cw + ci;
      if (!top[c]) continue;
      // a face is built when some of the building lies out in front of it (otherwise it is turned away from all of
      // it) and there is no block as high against it
      const x0 = (ci * BLOCK_TILES - MARGIN) * T,
        z0 = (cj * BLOCK_TILES - MARGIN) * T,
        x1 = x0 + BLOCK_TILES * T,
        z1 = z0 + BLOCK_TILES * T,
        faces = [box.x1 > x1, box.x0 < x0, box.z1 > z1, box.z0 < z0],
        sides = SIDE_STEP.flatMap(([di, dj], side) => {
          const ni = ci + di,
            nj = cj + dj,
            hidden = ni >= 0 && nj >= 0 && ni < cw && nj < ch && top[nj * cw + ni]! >= top[c]!;
          return faces[side] && !hidden ? [side] : [];
        });
      out.push({
        x0,
        z0,
        x1,
        z1,
        top: top[c]!,
        sides,
        facade: rng.randi(0, style.facades - 1),
        roof: rng.randi(0, style.roofs - 1),
      });
    }
  return out;
}

// The building's own outside, as seen from its windows (from one wing across to another, down on to the roof of a
// floor that stands out further below, up at one that hangs out over the window): floor by floor, its outline as
// boxes a tile on a side and a floor high, in the same frame as the blocks (y 0: the lowest floor's ground). A floor's
// outline is its floor, open or not, and the walls round it (`shellOf`); the face of a box is built where the next
// tile out is not of the floor (the outside of the outer wall), its roof where the floor above does not cover it,
// its underside where the floor below does not hold it up. `insides[0]` is the top floor; `storey`: from one floor's
// ground to the next; `facadeOf`: which facade picture a tile's box of floor m takes (its faces: `sides`).
export function buildingShell(
  insides: Uint8Array[],
  w: number,
  h: number,
  storey: number,
  facadeOf: (i: number, j: number, m: number, sides: number[]) => number = () => 0,
): OutsideBlock[] {
  const out: OutsideBlock[] = [],
    floors = insides.length,
    at = (m: number, i: number, j: number) =>
      m >= 0 && m < floors && i >= 0 && j >= 0 && i < w && j < h && !!insides[m]![j * w + i];
  insides.forEach((inside, m) => {
    const bottom = (floors - 1 - m) * storey;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        if (!inside[j * w + i]) continue;
        const sides = SIDE_STEP.flatMap(([di, dj], side) => (at(m, i + di, j + dj) ? [] : [side])),
          noRoof = at(m - 1, i, j),
          under = m < floors - 1 && !at(m + 1, i, j);
        if (!sides.length && noRoof && !under) continue;
        out.push({
          x0: i * T,
          z0: j * T,
          x1: (i + 1) * T,
          z1: (j + 1) * T,
          bottom,
          top: bottom + storey,
          sides,
          noRoof,
          under,
          facade: facadeOf(i, j, m, sides),
          roof: 0,
        });
      }
  });
  return out;
}
// a floor's outline for buildingShell and outsideBlocks: its floor tiles and its open tiles (a stairwell's, a
// courtyard's), and the walls next to them (the 8 round): the walls beyond those are not drawn, and stand for nothing
export function shellOf(floor: (k: number) => boolean, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!floor(j * w + i)) continue;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++)
          if (i + di >= 0 && j + dj >= 0 && i + di < w && j + dj < h) out[(j + dj) * w + i + di] = 1;
    }
  return out;
}

// The building's straight mass from its floors (1: floor or open on some floor, of all its floors together), with the
// gaps and notches between its parts up to 2 * CLOSE tiles across filled in (grown CLOSE tiles, the 8 round one step,
// then shrunk back as much), and what is still a tile thin widened by its walls. Left as the floors are, a corridor of
// one floor that runs out alone would stand from the street to the roof as a tower a tile thin, and the windows next to
// it would see it as a building of its own
const CLOSE = 3;
export function massOf(floors: Uint8Array, w: number, h: number): Uint8Array {
  // how far each tile is (the 8 round one step) from the tiles `from` gives a distance to, out to CLOSE + 1
  const reach = (from: (k: number) => number) => {
    const far = new Uint8Array(w * h).fill(CLOSE + 1),
      queue: number[] = [];
    for (let k = 0; k < w * h; k++) far[k] = Math.min(CLOSE + 1, from(k));
    // (nearest first: the tiles by their own distance)
    for (let d = 0; d <= CLOSE; d++) for (let k = 0; k < w * h; k++) if (far[k] === d) queue.push(k);
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q]!,
        i = k % w,
        j = (k / w) | 0;
      if (far[k]! >= CLOSE) continue;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const n = (j + dj) * w + i + di;
          if (i + di < 0 || j + dj < 0 || i + di >= w || j + dj >= h || far[n]! <= far[k]! + 1) continue;
          far[n] = far[k]! + 1;
          queue.push(n);
        }
    }
    return far;
  };
  // grown: within CLOSE of the floors; shrunk back: what is not within CLOSE of a tile that is not grown (past the
  // map's edge nothing is)
  const grown = reach(k => (floors[k] ? 0 : CLOSE + 1)),
    out = reach(k => {
      const i = k % w,
        j = (k / w) | 0;
      return grown[k]! > CLOSE ? 0 : Math.min(i, j, w - 1 - i, h - 1 - j) + 1;
    });
  const mass = Uint8Array.from(floors, (v, k) => (v || out[k]! > CLOSE ? 1 : 0)),
    at = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && !!mass[j * w + i],
    wide = Uint8Array.from(mass);
  // what is still a tile thin (a corridor that runs out far from the rest) takes in its walls on both sides
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!at(i, j)) continue;
      if (!at(i - 1, j) && !at(i + 1, j))
        for (const di of [-1, 1]) if (i + di >= 0 && i + di < w) wide[j * w + i + di] = 1;
      if (!at(i, j - 1) && !at(i, j + 1))
        for (const dj of [-1, 1]) if (j + dj >= 0 && j + dj < h) wide[(j + dj) * w + i] = 1;
    }
  return wide;
}

// What stands on the street round the building, among the blocks (buildOutsideCards): of each kind, on the tiles
// `out` (tiles from the building, as the blocks are measured) and not under a block. `every`: one on every so many
// tiles along it, in a row (a lamp at the kerb), as the tile's place along the street; or 0, then each tile has one
// by `chance`, set anywhere on the tile (trees grown up where they would). How high it stands (m) by the rng, as wide
// as its picture is for that (`wide`: its width over its height). `flat`: laid on the ground over the whole tile
// instead (paving: `h`, `wide` unused), turned a quarter at a time so that its picture does not repeat in step
export interface StreetThing {
  pic: number;
  h: [number, number];
  wide: number;
  out: [number, number];
  every: number;
  chance: number;
  flat?: boolean;
}
export function outsideStreet(
  inside: Uint8Array,
  w: number,
  h: number,
  blocks: OutsideBlock[],
  things: StreetThing[],
  rng: Rng,
): OutsideCard[] {
  const { far, ew, eh } = farFrom(inside, w, h),
    under = (x: number, z: number) => blocks.some(b => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1),
    out: OutsideCard[] = [];
  for (const t of things)
    for (let j = 0; j < eh; j++)
      for (let i = 0; i < ew; i++) {
        const d = far[j * ew + i]!;
        if (d < t.out[0] || d > t.out[1]) continue;
        if (t.every ? (i + j) % t.every : rng.next() >= t.chance) continue;
        const loose = t.every ? 0 : 0.35,
          x = (i - MARGIN + 0.5 + rng.rand(-loose, loose)) * T,
          z = (j - MARGIN + 0.5 + rng.rand(-loose, loose)) * T;
        if (under(x, z)) continue;
        if (t.flat) {
          out.push({ x, z, w: T, h: 0, pic: t.pic, turn: rng.randi(0, 3) * (Math.PI / 2), flat: true });
          continue;
        }
        const tall = rng.rand(...t.h);
        out.push({ x, z, w: tall * t.wide, h: tall, pic: t.pic, turn: rng.rand(0, Math.PI) });
      }
  return out;
}
