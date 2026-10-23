import * as THREE from 'three';
import { T } from '@engine/world/tiles.ts';
import type { FloorPlan } from '../../building.ts';
import { pose } from '../props.ts';
import type { PropTools } from '../props.ts';
// The mall's tactile paving: one yellow line laid on the concourse (the corridor floor that belongs to no room), joined
// at every bend and fork, as the line for the blind runs through a real mall. A thin slab on the floor: it has no body
// in the tile world.
// ---- tuning numbers used only here ----
const LINE = { w: 0.34, thick: 0.02, y: 0.03, color: 0x8f7d34 }; // the line's width and thickness, its height over the floor (m), colour
const STRIP_MAX = 2; // a run of corridor tiles this short across is a strip (a concourse 2 wide: the line runs on the seam between its two tiles)
const SETTLE_PASSES = 12; // how far a tile asks its neighbours for the place of the line, at a bend or a crossing

interface Seg {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}
// the line's segments, from tile centres and seams (null when the floor has no concourse)
function lineOf(plan: FloorPlan): Seg[] {
  const { W, H, maps: M } = plan.gen,
    court = new Set<number>();
  // (an atrium's gallery and middle are not the concourse: no line there)
  if (plan.court)
    for (const k of plan.court.tiles)
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) court.add(k + dj * W + di);
  const lane = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= W || j >= H) return false;
    const k = j * W + i;
    return (
      M.grid[k] === 1 &&
      M.roomOf[k]! < 0 &&
      M.hgt[k] === 0 &&
      M.ramp[k]! < 0 &&
      !M.cover[k] &&
      !M.door?.[k] &&
      !plan.noFloor[k] &&
      !plan.voids[k] &&
      !court.has(k)
    );
  };
  // the run of lane tiles through (i, j) along x (dx 1) or z (dz 1): its first tile and its last
  const run = (i: number, j: number, dx: number, dz: number): [number, number] => {
    let a = 0,
      b = 0;
    while (lane(i - (a + 1) * dx, j - (a + 1) * dz)) a++;
    while (lane(i + (b + 1) * dx, j + (b + 1) * dz)) b++;
    return [a, b];
  };
  const tiles: number[] = [],
    at = new Map<number, [number | null, number | null]>();
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (!lane(i, j)) continue;
      const k = j * W + i,
        [l, r] = run(i, j, 1, 0),
        [u, d] = run(i, j, 0, 1),
        across = l + r + 1,
        down = u + d + 1;
      tiles.push(k);
      // a tile in a strip 2 wide (or less) is on its seam; the place along the strip is the tile's own
      at.set(k, [
        across <= STRIP_MAX && down >= 2 ? (i - l + (across - 1) / 2 + 0.5) * T : null,
        down <= STRIP_MAX && across >= 2 ? (j - u + (down - 1) / 2 + 0.5) * T : null,
      ]);
    }
  // a tile that is not in a strip (a bend, a crossing, a long concourse) takes the place from its neighbours that are
  for (let pass = 0; pass < SETTLE_PASSES; pass++)
    for (const k of tiles) {
      const p = at.get(k)!,
        i = k % W,
        j = (k / W) | 0;
      if (p[0] === null)
        for (const n of [k - W, k + W]) if (lane(i, (n / W) | 0) && at.get(n)?.[0] != null) p[0] = at.get(n)![0];
      if (p[1] === null)
        for (const n of [k - 1, k + 1]) if (lane(n % W, j) && at.get(n)?.[1] != null) p[1] = at.get(n)![1];
    }
  const place = (k: number): [number, number] => {
    const p = at.get(k)!;
    return [p[0] ?? ((k % W) + 0.5) * T, p[1] ?? (((k / W) | 0) + 0.5) * T];
  };
  const segs = new Map<string, Seg>(),
    add = (x1: number, z1: number, x2: number, z2: number) => {
      if (Math.abs(x1 - x2) < 0.01 && Math.abs(z1 - z2) < 0.01) return;
      const key = [x1, z1, x2, z2].map(v => v.toFixed(1)).join(),
        back = [x2, z2, x1, z1].map(v => v.toFixed(1)).join();
      if (!segs.has(key) && !segs.has(back)) segs.set(key, { x1, z1, x2, z2 });
    };
  for (const k of tiles)
    for (const n of [k + 1, k + W]) {
      if (!lane(n % W, (n / W) | 0) || (n === k + 1 && (k % W) + 1 >= W)) continue;
      const [x1, z1] = place(k),
        [x2, z2] = place(n);
      // from one tile's place to the next's: first along the way between the two tiles, then across
      if (n === k + 1) {
        add(x1, z1, x2, z1);
        add(x2, z1, x2, z2);
      } else {
        add(x1, z1, x1, z2);
        add(x1, z2, x2, z2);
      }
    }
  return [...segs.values()];
}

// lays the line on a floor's concourse (`add`: PropTools.add)
export function tactileLine(plan: FloorPlan, add: PropTools['add']) {
  const along: THREE.Matrix4[] = [],
    across: THREE.Matrix4[] = [];
  for (const s of lineOf(plan)) {
    const horizontal = Math.abs(s.z1 - s.z2) < 0.01,
      len = (horizontal ? Math.abs(s.x2 - s.x1) : Math.abs(s.z2 - s.z1)) + LINE.w,
      at = new THREE.Vector3((s.x1 + s.x2) / 2, LINE.y, (s.z1 + s.z2) / 2);
    (horizontal ? along : across).push(pose(at, horizontal ? 0 : Math.PI / 2, new THREE.Vector3(len, 1, 1)));
  }
  const slab = new THREE.BoxGeometry(1, LINE.thick, LINE.w),
    mat = new THREE.MeshBasicMaterial({ color: LINE.color });
  add(slab, mat, along);
  add(slab, mat, across);
}
