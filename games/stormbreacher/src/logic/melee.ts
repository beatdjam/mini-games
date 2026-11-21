// The melee blow's own state and its one-frame step: the wait before the next blow, the windup and swing, the short lunge
// and the sector that picks a target. It reads no three and no DOM, so a node test can run it. game.ts keeps the state and
// takes the damage.
import { meleeBlowSec, meleeHitSec, MELEE_TUNE } from '../data/melee.ts';
import { pushOutCircle, type GroundRect } from './collide.ts';

// The lunge is split into steps no longer than this, so a fast lunge cannot pass through a thin wall (s).
const MAX_LUNGE_STEP = 1 / 120;

interface Lunge {
  dx: number; // the direction of the lunge, length 1
  dz: number;
  left: number; // the distance left to travel (m)
  speed: number; // how fast it travels (m/s)
}

// A blow on its way: the windup, then the swing through, then the arm's return. The blow lands once, at MELEE_HIT_SEC.
interface Blow {
  t: number; // the seconds since the blow began (s)
  struck: boolean; // the blow has landed; it is kept so a frame cannot strike twice
}

export interface MeleeState {
  wait: number; // the seconds before the next blow (s)
  lunge: Lunge | null; // the lunge under way; null when the mech stands
  blow: Blow | null; // the blow under way; null between blows
}

// A place the fist may reach, on the ground.
export interface MeleePoint {
  x: number;
  z: number;
}

export function newMelee(): MeleeState {
  return { wait: 0, lunge: null, blow: null };
}

// Starts a blow: the wait is set and the arm begins its windup. The lunge waits for the strike, when the target and so the
// lunge's length are known.
export function beginMelee(state: MeleeState): void {
  state.wait = MELEE_TUNE.interval;
  state.blow = { t: 0, struck: false };
}

// Moves the blow on by `dt` and says whether it lands this frame. The blow stays in the state through the arm's return, so
// the view can finish the motion from the same clock.
export function stepMeleeBlow(state: MeleeState, dt: number): boolean {
  const blow = state.blow;
  if (blow === null) return false;
  blow.t += dt;
  let struck = false;
  if (!blow.struck && blow.t >= meleeHitSec()) {
    blow.struck = true;
    struck = true;
  }
  if (blow.t >= meleeBlowSec()) state.blow = null;
  return struck;
}

// Starts the step-in: the mech goes where it faces, farther when the blow met a target than when it struck the air, so a
// miss still shows the step in without carrying the mech past its target.
export function beginLunge(state: MeleeState, yaw: number, hit: boolean): void {
  const distance = hit ? MELEE_TUNE.lungeDistance : MELEE_TUNE.missDistance;
  state.lunge = {
    dx: -Math.sin(yaw),
    dz: -Math.cos(yaw),
    left: distance,
    speed: distance / MELEE_TUNE.lungeSec,
  };
}

// Moves the lunge on by `dt`, pushing the mech out of the walls on the way. `over` is the height the mech may step over,
// as stepMech gets it; a low prop does not stop the lunge. The map's edge is left to the caller's clamp.
export function stepMeleeLunge(
  state: MeleeState,
  mech: { x: number; z: number },
  dt: number,
  rects: readonly GroundRect[],
  radius: number,
  over: number,
): void {
  const lunge = state.lunge;
  if (lunge === null || dt <= 0) return;
  let frame = Math.min(dt, lunge.left / lunge.speed);
  while (frame > 1e-9 && lunge.left > 0) {
    const h = Math.min(MAX_LUNGE_STEP, frame);
    const move = Math.min(lunge.left, lunge.speed * h);
    mech.x += lunge.dx * move;
    mech.z += lunge.dz * move;
    lunge.left -= move;
    const pushed = pushOutCircle(mech.x, mech.z, radius, rects, over);
    mech.x = pushed.x;
    mech.z = pushed.z;
    frame -= h;
  }
  if (lunge.left <= 1e-9) state.lunge = null;
}

// The index of the nearest point inside the mech's front sector, or -1 when the sector is empty. The caller leaves out what
// the blow cannot harm (the fallen) and keeps the point's own ground place; the range is measured on the ground.
export function meleeTarget(mech: { x: number; z: number; yaw: number }, points: readonly MeleePoint[]): number {
  const fx = -Math.sin(mech.yaw);
  const fz = -Math.cos(mech.yaw);
  const cosHalf = Math.cos((MELEE_TUNE.halfArcDeg * Math.PI) / 180);
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const dx = points[i].x - mech.x;
    const dz = points[i].z - mech.z;
    const dist = Math.hypot(dx, dz);
    if (dist > MELEE_TUNE.range || dist < 1e-6) continue;
    if ((dx * fx + dz * fz) / dist < cosHalf) continue;
    if (dist >= bestDist) continue;
    best = i;
    bestDist = dist;
  }
  return best;
}
