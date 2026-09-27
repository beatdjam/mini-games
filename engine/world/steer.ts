import { floorY, flowDir, moveCircle, type Mover } from './tiles.ts';
// engine: Chasing on the tile world.
// steerChase(e, dt, dx, dz, dist, los, speed, keep, others, ignore)
//   e: the mover (x, z, r, fy; side = +1/-1 for which way it circles, flipped now and then)
//   dx, dz, dist: vector and distance to the target; los: the target is in sight
//   In sight it heads straight at the target, or circles it at `keep` metres if closer than that (at 60% speed).
//   Out of sight it follows the flow field (engine/world/tiles.js computeFlow). Movers in `others` push each other
//   apart (skipping dead ones and any for which ignore(o) is true). Moves with collision and updates e.fy.
// a mover with a radius; side (+1 / -1, default +1) is the way it circles when too close
export interface Chaser extends Mover { r: number; side?: number; dead?: boolean; }
export function steerChase<C extends Chaser>(e: C, dt: number, dx: number, dz: number, dist: number, los: boolean, speed: number, keep: number | undefined,
  others: Iterable<C>, ignore?: ((o: C) => boolean) | null) {
  let tx = 0, tz = 0;
  if (los) {
    if (keep && dist < keep) {
      const side = e.side ?? 1;
      tx = -dz / dist * side;
      tz = dx / dist * side;
      speed *= 0.6;
      if (Math.random() < dt * 0.4) e.side = -side;
    } else {
      tx = dx / dist;
      tz = dz / dist;
    }
  } else {
    const f = flowDir(e.x, e.z);
    if (f) { tx = f[0]; tz = f[1]; } else { tx = dx / dist; tz = dz / dist; }
  }
  for (const o of others) {
    if (o === e || o.dead || (ignore && ignore(o))) continue;
    const ox = e.x - o.x, oz = e.z - o.z, d2 = ox * ox + oz * oz, rr = e.r + o.r + 0.3;
    if (d2 < rr * rr && d2 > 1e-4) {
      const d = Math.sqrt(d2);
      tx += ox / d * 0.9;
      tz += oz / d * 0.9;
    }
  }
  const tl = Math.hypot(tx, tz);
  if (tl > 0.01) {
    moveCircle(e, tx / tl * speed * dt, tz / tl * speed * dt, e.r);
    e.fy = floorY(e.x, e.z);
  }
}
