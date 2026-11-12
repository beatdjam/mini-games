// A pillbox's own state: the wait before its next warning, the warning, and the shots left in a burst. Pure functions
// on small states; the random draw comes in as an argument. logic/game.ts keeps the states, flies the bullets and
// reports the events.
import type { Rng } from '@engine/core/index.ts';
import { PILLBOX_ARMOR, PILLBOX_TUNE } from '../data/pillbox.ts';
import { MECH_TUNE } from '../data/tune.ts';
import type { EnemyShot } from './enemies.ts';
import { spreadDir } from './fcs.ts';
import { fireRayHit, type Aabb } from './fire.ts';

export interface PillboxState {
  id: string;
  wait: number; // the seconds before the next warning
  warn: number; // the seconds of warning left; 0 when it is not warning
  shots: number; // the shots left in the burst
  shotWait: number; // the seconds before the next shot of the burst
}

// What one frame of a pillbox did: the warning it started and the shot it fired, either or both absent.
export interface PillboxStep {
  warnAt: { x: number; y: number; z: number } | null;
  shot: EnemyShot | null;
}

// A pillbox with its first warning still to come.
export function newPillbox(id: string): PillboxState {
  return { id, wait: PILLBOX_TUNE.firstWait, warn: 0, shots: 0, shotWait: 0 };
}

// The direction a pillbox faces on the ground: its front is +z turned by the map's yaw.
export function pillboxFront(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

// The share of a shot's damage a pillbox takes. Its front is `pillboxFront`, but the shot's direction (dx, dz) points
// away from the shooter, so the angle is taken between the front and the way back to the shooter. A shot with no
// horizontal direction counts as a side hit.
export function pillboxDamageMul(yaw: number, dx: number, dz: number): number {
  const length = Math.hypot(dx, dz);
  if (length === 0) return PILLBOX_ARMOR.sideMul;
  const front = pillboxFront(yaw);
  const cos = Math.min(1, Math.max(-1, (-dx * front.x - dz * front.z) / length));
  const angle = (Math.acos(cos) * 180) / Math.PI;
  return angle <= PILLBOX_ARMOR.frontArc ? PILLBOX_ARMOR.frontMul : PILLBOX_ARMOR.sideMul;
}

// How far along `front` the box's face lies from its middle: the first face the line meets.
function frontDistance(box: Aabb, front: { x: number; z: number }): number {
  const halfX = (box.maxX - box.minX) / 2;
  const halfZ = (box.maxZ - box.minZ) / 2;
  const ax = Math.abs(front.x);
  const az = Math.abs(front.z);
  const outX = ax < 1e-12 ? Infinity : halfX / ax;
  const outZ = az < 1e-12 ? Infinity : halfZ / az;
  return Math.min(outX, outZ);
}

// Where a pillbox's shots leave: just past its front face, at the muzzle's share of its height. The shot has to start
// outside the box, or its own wall would stop it.
export function pillboxMuzzle(box: Aabb, yaw: number): { x: number; y: number; z: number } {
  const front = pillboxFront(yaw);
  const out = frontDistance(box, front) + PILLBOX_TUNE.muzzleGap;
  const x = (box.minX + box.maxX) / 2;
  const z = (box.minZ + box.maxZ) / 2;
  return { x: x + front.x * out, y: box.maxY * PILLBOX_TUNE.muzzle, z: z + front.z * out };
}

// The aim at the mech's chest from the muzzle, or null when the mech is out of reach or the line is stopped. The
// pillbox's own box counts as a wall, so a mech behind or beside it is not in its field of fire.
function aimAt(
  box: Aabb,
  yaw: number,
  mech: { x: number; y: number; z: number },
  blockers: readonly Aabb[],
): { muzzle: { x: number; y: number; z: number }; dx: number; dy: number; dz: number } | null {
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  if (Math.hypot(mech.x - cx, mech.z - cz) > PILLBOX_TUNE.range) return null;
  const muzzle = pillboxMuzzle(box, yaw);
  const dx = mech.x - muzzle.x;
  const dy = mech.y + MECH_TUNE.chestHeight - muzzle.y;
  const dz = mech.z - muzzle.z;
  if (fireRayHit(muzzle.x, muzzle.y, muzzle.z, dx, dy, dz, Math.hypot(dx, dy, dz), [box, ...blockers])) return null;
  return { muzzle, dx, dy, dz };
}

// One frame of one pillbox. `box` is its box, `mech` the mech's feet and `blockers` the props and the other standing
// targets. It waits until it can see the mech, warns for `warn` seconds, then fires `burst` shots `shotInterval` apart;
// a line that closes during the burst ends it, and `interval` passes before the next warning. Returns the warning it
// started and the shot it fired this frame.
export function stepPillbox(
  state: PillboxState,
  box: Aabb,
  yaw: number,
  mech: { x: number; y: number; z: number },
  blockers: readonly Aabb[],
  dt: number,
  rng: Rng,
): PillboxStep {
  const aim = aimAt(box, yaw, mech, blockers);
  if (state.warn > 0) {
    state.warn = Math.max(0, state.warn - dt);
    if (state.warn > 0) return { warnAt: null, shot: null };
    // the warning is over: the burst starts in this same frame
    state.shots = PILLBOX_TUNE.burst;
    state.shotWait = 0;
  }
  if (state.shots > 0) {
    state.shotWait -= dt;
    if (state.shotWait > 0) return { warnAt: null, shot: null };
    if (aim === null) {
      // the mech went behind cover: the burst is over and the wait starts again
      state.shots = 0;
      state.wait = PILLBOX_TUNE.interval;
      return { warnAt: null, shot: null };
    }
    state.shots -= 1;
    state.shotWait = PILLBOX_TUNE.shotInterval;
    if (state.shots === 0) state.wait = PILLBOX_TUNE.interval;
    const { muzzle, dx, dy, dz } = aim;
    const aimed = spreadDir({ dx, dy, dz }, PILLBOX_TUNE.spread, rng);
    return { warnAt: null, shot: { x: muzzle.x, y: muzzle.y, z: muzzle.z, dx: aimed.dx, dy: aimed.dy, dz: aimed.dz } };
  }
  // The wait counts only while the mech can be shot at, so one that spent the wait behind cover does not fire the
  // moment the mech steps out.
  if (aim === null) return { warnAt: null, shot: null };
  if (state.wait > 0) {
    state.wait = Math.max(0, state.wait - dt);
    return { warnAt: null, shot: null };
  }
  state.warn = PILLBOX_TUNE.warn;
  return { warnAt: { ...aim.muzzle }, shot: null };
}
