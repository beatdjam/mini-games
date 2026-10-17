import { SIDE_STEP } from './tiles.ts';
// How a wall tile of a tile map stands toward the floor round it: which of its faces a floor tile looks at, whether
// it is the outside wall of what the map holds or a thin wall between two places, which way a face looks. No random
// numbers; reads only `grid` (1 = floor). For choosing what goes on a wall (a window on the outside wall only, the
// evening sun through the windows facing west, ...)
export interface WallMap {
  W: number;
  H: number;
  maps: { grid: ArrayLike<number> };
}
// the steps (di, dj) from wall tile k to the floor tiles beside it, in SIDE_STEP order (none: no floor sees it)
export function floorSides(d: WallMap, k: number): [number, number][] {
  return SIDE_STEP.filter(([di, dj]) => d.maps.grid[k + dj * d.W + di] === 1).map(([di, dj]) => [di!, dj!]);
}
// 'outer' when behind every face of the wall tile (looking away from the floor that face is seen from) there is no
// floor out to the map's edge: the outside wall. 'inner' when right behind every face there is floor: a wall one
// tile thick between two places. Else null (more of the map some way behind it, or no floor sees it).
// `beyond` (by tile) changes what the look out meets: 1, as good as floor (the floor of another level of a building,
// whose outside wall is further out); 2, as good as the map's edge (a courtyard open to the sky)
export function wallSide(d: WallMap, k: number, beyond?: ArrayLike<number>): 'outer' | 'inner' | null {
  const { W, H } = d,
    i = k % W,
    j = Math.floor(k / W),
    sides = floorSides(d, k);
  if (!sides.length) return null;
  let outer = true,
    inner = true;
  for (const [di, dj] of sides) {
    // from the wall, away from that floor, until floor (or what counts as floor or as the edge) or the edge
    let n = 1,
      out = false;
    while (i - di * n >= 0 && j - dj * n >= 0 && i - di * n < W && j - dj * n < H) {
      const t = (j - dj * n) * W + i - di * n;
      if (beyond?.[t] === 2) {
        out = true;
        break;
      }
      if (d.maps.grid[t] === 1 || beyond?.[t] === 1) break;
      n++;
    }
    if (!out && i - di * n >= 0 && j - dj * n >= 0 && i - di * n < W && j - dj * n < H) outer = false;
    if (n !== 1 || out) inner = false;
  }
  return outer ? 'outer' : inner ? 'inner' : null;
}
// does a face of wall tile k look toward (dx, dz) (one of SIDE_STEP): is the floor it is seen from on the other side
export const facesToward = (d: WallMap, k: number, [dx, dz]: readonly [number, number]): boolean =>
  d.maps.grid[k - dz * d.W - dx] === 1;
// What a wall tile shows on its other face, seen from outside the building (a courtyard now; later a street one walks
// in, round a building one can go into): it agrees with what is on the inside, so a window seen from a room is a
// window seen from outside too, at the same tile, and a bare wall inside is a bare wall outside. Without it the two
// sides are chosen apart, and from one window the window next to it round a corner is a blank wall.
// `inside`: the picture on the wall's inner face; `isWindow`: whether a picture is a window; `outer`: the picture to
// show outside for an inner window, when it has one fit to be seen from outside (a window seen through from inside
// shows the dark room behind its glass, not the view through the building), else null; `pick(window)`: a picture of
// the outside's own, a window or a bare wall
export function facadePicture(
  inside: number,
  isWindow: (v: number) => boolean,
  outer: (v: number) => number | null,
  pick: (window: boolean) => number,
): { pic: number; window: boolean } {
  const window = isWindow(inside);
  return { pic: window ? (outer(inside) ?? pick(true)) : pick(false), window };
}
// Where wall tile k faces an open place outside the building (marked 2 in `beyond`, as wallSide reads it: a courtyard
// open to the sky) right behind it, not floor of its own: its place along that wall, the tile's column (i) on a wall
// that runs along x, its row (j) on one along z; else null. Both sides of the wall count windows by it (facadePicture),
// so a window seen from a room and the one seen from the yard are the same column on every floor
export function alongOpen(d: WallMap, k: number, beyond?: ArrayLike<number>): number | null {
  if (!beyond) return null;
  for (const [di, dj] of SIDE_STEP) {
    const t = k + dj * d.W + di;
    if (beyond[t] === 2 && d.maps.grid[t] !== 1) return dj ? k % d.W : (k / d.W) | 0;
  }
  return null;
}
