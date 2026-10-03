import { floorY, flowDir, moveCircle, type Mover } from './tiles.ts';
// engine: Chasing on the tile world.
// steerChase(e, dt, dx, dz, dist, los, speed, keep, others, ignore)
//   e: the mover (x, z, r, fy; side = +1/-1 for which way it circles, flipped now and then)
//   dt: seconds since the last step; speed: metres per second (CIRCLE_SPEED_MUL of it while circling)
//   dx, dz, dist: vector and distance to the target; los: the target is in sight
//   In sight it heads straight at the target, or circles it at `keep` metres if closer than that (slower).
//   Out of sight it follows the flow field (engine/src/world/tiles.ts computeFlow). Movers in `others` push each other
//   apart (skipping dead ones and any for which ignore(o) is true). Moves with collision and updates e.fy.
const CIRCLE_SPEED_MUL = 0.6; // speed multiplier while circling inside `keep` range (ratio)
const SIDE_FLIP_RATE = 0.4; // chance per second of reversing the circling direction (1/s)
const SEPARATION_MARGIN = 0.3; // movers push apart when closer than the sum of their radii plus this (m)
const SEPARATION_PUSH = 0.9; // length of the push away from each neighbour, added to the unit heading (ratio)
const SEPARATION_MIN_D2 = 1e-4; // neighbours closer than this (squared, m²) are skipped, to avoid dividing by ~0
const MIN_HEADING_LEN = 0.01; // a heading shorter than this means stand still (ratio of a unit heading)
// a mover with a radius; side (+1 / -1, default +1) is the way it circles when too close
export interface Chaser extends Mover {
  r: number;
  side?: number;
  dead?: boolean;
}
// the unit heading straight at the target, or along the flow field when out of sight (straight if the field has none)
function seekHeading(e: Chaser, dx: number, dz: number, dist: number, los: boolean): [number, number] {
  if (!los) {
    const f = flowDir(e.x, e.z);
    if (f) return [f[0], f[1]];
  }
  return [dx / dist, dz / dist];
}
// the unit heading sideways around the target (side +1 / -1), and now and then reverses e.side
function circleHeading(e: Chaser, dt: number, dx: number, dz: number, dist: number): [number, number] {
  const side = e.side ?? 1;
  if (Math.random() < dt * SIDE_FLIP_RATE) e.side = -side;
  return [(-dz / dist) * side, (dx / dist) * side];
}
// the heading (tx, tz) with a push away from each neighbour in `others` that is too close added to it
function separationPush<C extends Chaser>(
  e: C,
  tx: number,
  tz: number,
  others: Iterable<C>,
  ignore?: ((o: C) => boolean) | null,
): [number, number] {
  let sx = tx,
    sz = tz;
  for (const o of others) {
    if (o === e || o.dead || (ignore && ignore(o))) continue;
    const ox = e.x - o.x,
      oz = e.z - o.z,
      d2 = ox * ox + oz * oz,
      rr = e.r + o.r + SEPARATION_MARGIN;
    if (d2 < rr * rr && d2 > SEPARATION_MIN_D2) {
      const d = Math.sqrt(d2);
      sx += (ox / d) * SEPARATION_PUSH;
      sz += (oz / d) * SEPARATION_PUSH;
    }
  }
  return [sx, sz];
}
// move e along the heading (tx, tz) at `speed` m/s for dt seconds, with collision, and update e.fy
// (stands still if the heading is ~0)
function moveAlong(e: Chaser, tx: number, tz: number, speed: number, dt: number) {
  const tl = Math.hypot(tx, tz);
  if (tl > MIN_HEADING_LEN) {
    moveCircle(e, (tx / tl) * speed * dt, (tz / tl) * speed * dt, e.r);
    e.fy = floorY(e.x, e.z);
  }
}
export function steerChase<C extends Chaser>(
  e: C,
  dt: number,
  dx: number,
  dz: number,
  dist: number,
  los: boolean,
  speed: number,
  keep: number | undefined,
  others: Iterable<C>,
  ignore?: ((o: C) => boolean) | null,
) {
  const circling = los && !!keep && dist < keep;
  const [tx, tz] = circling ? circleHeading(e, dt, dx, dz, dist) : seekHeading(e, dx, dz, dist, los);
  const [px, pz] = separationPush(e, tx, tz, others, ignore);
  moveAlong(e, px, pz, circling ? speed * CIRCLE_SPEED_MUL : speed, dt);
}
