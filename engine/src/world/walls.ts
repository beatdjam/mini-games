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
// tile thick between two places. Else null (more of the map some way behind it, or no floor sees it)
export function wallSide(d: WallMap, k: number): 'outer' | 'inner' | null {
  const { W, H } = d,
    i = k % W,
    j = Math.floor(k / W),
    sides = floorSides(d, k);
  if (!sides.length) return null;
  let outer = true,
    inner = true;
  for (const [di, dj] of sides) {
    // from the wall, away from that floor, until floor or the edge
    let n = 1;
    while (i - di * n >= 0 && j - dj * n >= 0 && i - di * n < W && j - dj * n < H) {
      if (d.maps.grid[(j - dj * n) * W + i - di * n] === 1) break;
      n++;
    }
    const edge = i - di * n < 0 || j - dj * n < 0 || i - di * n >= W || j - dj * n >= H;
    if (!edge) outer = false;
    if (n !== 1) inner = false;
  }
  return outer ? 'outer' : inner ? 'inner' : null;
}
// does a face of wall tile k look toward (dx, dz) (one of SIDE_STEP): is the floor it is seen from on the other side
export const facesToward = (d: WallMap, k: number, [dx, dz]: readonly [number, number]): boolean =>
  d.maps.grid[k - dz * d.W - dx] === 1;
