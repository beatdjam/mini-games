// The shot's path: a ray against the target boxes, as a pure function (slab method). No three, so a node test can run
// it. A candidate to move into the engine (D-23): it reads no game table, so every value comes in as an argument.
export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

// The distance along the ray at which it enters the box, or null when it misses or enters past `range` (m).
function entryDistance(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  range: number,
  box: Aabb,
): number | null {
  let near = 0;
  let far = range;
  const axis = (origin: number, dir: number, min: number, max: number): boolean => {
    if (Math.abs(dir) < 1e-12) return origin >= min && origin <= max;
    let t0 = (min - origin) / dir;
    let t1 = (max - origin) / dir;
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    return near <= far;
  };
  if (!axis(ox, dx, box.minX, box.maxX)) return null;
  if (!axis(oy, dy, box.minY, box.maxY)) return null;
  if (!axis(oz, dz, box.minZ, box.maxZ)) return null;
  return near <= far ? near : null;
}

export interface RayHit {
  index: number; // the box's place in the list
  dist: number; // how far along the ray the box starts (m)
}

// The first box a ray from (ox, oy, oz) toward (dx, dy, dz) meets within `range` m, with the distance to it, or null.
// The direction does not have to be normalized; every target is a box.
export function fireRayHit(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  range: number,
  targets: readonly Aabb[],
): RayHit | null {
  const length = Math.hypot(dx, dy, dz);
  if (length < 1e-12 || range <= 0) return null;
  const nx = dx / length;
  const ny = dy / length;
  const nz = dz / length;
  let best: RayHit | null = null;
  for (let i = 0; i < targets.length; i++) {
    const dist = entryDistance(ox, oy, oz, nx, ny, nz, range, targets[i]);
    if (dist !== null && (best === null || dist < best.dist)) best = { index: i, dist };
  }
  return best;
}

// The index of the first box a ray meets within `range` m, or -1.
export function fireRay(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  range: number,
  targets: readonly Aabb[],
): number {
  return fireRayHit(ox, oy, oz, dx, dy, dz, range, targets)?.index ?? -1;
}
