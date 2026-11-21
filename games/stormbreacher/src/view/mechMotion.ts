// How the mech's body moves (SB-130's third card): the legs swing as it walks, tuck in the air, the body leans and
// shows a flame as it boosts, sinks as it lands, and the arms pull back as it fires. A melee blow runs its own clock: the
// fist draws back, the torso twists and tips into the swing, and the body sinks as the blow lands. The state and the
// numbers it turns into are here, with no three, so a node test can check them; view/mechModel.ts writes them into the
// boxes. It only reads the mech's speed, footing, events and the blow's clock, and never changes the game.
import type { GaitKind, GaitLook } from '../data/mech.ts';
import { meleeBlowSec, meleeHitSec, MELEE_TUNE } from '../data/melee.ts';
import { MOTION_TUNE } from '../data/tune.ts';

export interface MotionState {
  phase: number; // where the swing is in its cycle (0 to 1, wraps)
  walk: number; // how much the legs swing (0 to 1)
  air: number; // how much the legs are tucked (0 to 1)
  boost: number; // how much the body leans and the flame shows (0 to 1)
  recoil: number; // how far the arms are pulled back (1 just after a shot, then falls to 0)
  swing: number; // the seconds since a melee blow began, or -1 between blows
  dip: number; // how deep the body has sunk (1 is the full dip, then falls to 0)
}

// What one frame tells the motion.
export interface MotionInput {
  speed: number; // the speed along the ground (m/s)
  grounded: boolean;
  boosting: boolean;
  landSpeed: number | null; // the falling speed (m/s) if the mech landed this frame
  fired: boolean; // whether the mech's main weapon fired this frame
  meleeT?: number | null; // the seconds since the melee blow began, or null between blows
}

export function newMotion(): MotionState {
  return { phase: 0, walk: 0, air: 0, boost: 0, recoil: 0, swing: -1, dip: 0 };
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

// Moves `value` toward `target` by at most `rate` a second.
function approach(value: number, target: number, rate: number, dt: number): number {
  const step = rate * dt;
  if (Math.abs(target - value) <= step) return target;
  return value + Math.sign(target - value) * step;
}

// A value along a piece of straight lines: the keys are (seconds, value) from the blow's start, and times outside the span
// hold the first or the last value. The blow's phases end at 0, so a finished blow leaves the body at rest.
function key(t: number, frames: readonly (readonly [number, number])[]): number {
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (t <= first[0]) return first[1];
  for (let i = 1; i < frames.length; i++) {
    const [to, value] = frames[i];
    if (t > to) continue;
    const [from, before] = frames[i - 1];
    const share = (t - from) / (to - from);
    return before + (value - before) * share;
  }
  return last[1];
}

// When the swing ends and the blow is over (s). MELEE_TUNE keeps the game's strike on the same clock.
const swingEndSec = (): number => MELEE_TUNE.windupSec + MELEE_TUNE.swingSec;

// Moves the motion on by `dt`. `stride` is the ground one swing cycle covers (m).
export function stepMotion(m: MotionState, input: MotionInput, dt: number, stride: number): void {
  const walking = input.grounded && !input.boosting && input.speed > MOTION_TUNE.idleSpeed;
  m.walk = approach(m.walk, walking ? clamp01(input.speed / MOTION_TUNE.walkSpeed) : 0, MOTION_TUNE.walkRate, dt);
  if (walking) m.phase = (m.phase + (input.speed * dt) / stride) % 1;
  m.air = approach(m.air, input.grounded ? 0 : 1, MOTION_TUNE.airRate, dt);
  m.boost = approach(m.boost, input.boosting ? 1 : 0, MOTION_TUNE.boostRate, dt);
  m.recoil = Math.max(0, m.recoil - dt / MOTION_TUNE.recoilTime);
  m.swing = input.meleeT ?? -1;
  m.dip = Math.max(0, m.dip - dt / MOTION_TUNE.landTime);
  if (input.fired) m.recoil = 1;
  if (input.landSpeed !== null) m.dip = clamp01(input.landSpeed / MOTION_TUNE.landSpeed);
}

// Which half of the cycle a leg swings in: the left and right legs are opposite, and the multi legs pair the diagonal
// ones. `sx` and `sz` are the leg's sides (+1 right or back, -1 left or front, 0 for a box on the middle line).
export function legOffset(gait: GaitKind, sx: number, sz: number): number {
  const side = gait === 'multi' ? sx * sz : sx;
  return side < 0 ? 0.5 : 0;
}

// A leg's angle about the hip (rad; positive swings the foot forward, toward -z): the swing plus the tuck in the air.
export function legAngle(m: MotionState, gait: GaitKind, look: GaitLook, sx: number, sz: number): number {
  const swing = m.walk * look.swing * Math.sin(2 * Math.PI * (m.phase + legOffset(gait, sx, sz)));
  return swing - m.air * look.bend;
}

// How far the body leans forward (rad, the tilt about the x axis; negative tips the top toward -z) while boosting and into
// a blow.
export const leanAngle = (m: MotionState): number => -MOTION_TUNE.lean * m.boost - punchLean(m);

// How far the arms are pulled back, as a ratio of the mech's height.
export const recoilBack = (m: MotionState): number => MOTION_TUNE.recoilBack * m.recoil;

// How far the punching arm is thrown forward, as a ratio of the mech's height; negative in the windup, when it is drawn
// back.
export const punchReach = (m: MotionState): number =>
  key(m.swing, [
    [0, 0],
    [MELEE_TUNE.windupSec, -MOTION_TUNE.punchBack],
    [meleeHitSec(), MOTION_TUNE.punchReach],
    [swingEndSec(), MOTION_TUNE.punchReach * 0.85],
    [meleeBlowSec(), 0],
  ]);

// How far the torso turns with the blow (rad, about the vertical axis; positive turns the right shoulder toward -z). It
// is drawn back in the windup and comes through with the fist.
export const punchTwist = (m: MotionState): number =>
  key(m.swing, [
    [0, 0],
    [MELEE_TUNE.windupSec, -MOTION_TUNE.punchTwist],
    [meleeHitSec(), MOTION_TUNE.punchTwist],
    [swingEndSec(), MOTION_TUNE.punchTwist * 0.6],
    [meleeBlowSec(), 0],
  ]);

// How far the torso tips forward into the blow (rad, counted as a forward lean).
export const punchLean = (m: MotionState): number =>
  key(m.swing, [
    [0, 0],
    [MELEE_TUNE.windupSec, -MOTION_TUNE.punchLean * 0.4],
    [meleeHitSec(), MOTION_TUNE.punchLean],
    [swingEndSec(), MOTION_TUNE.punchLean * 0.6],
    [meleeBlowSec(), 0],
  ]);

// How deep the blow sinks the body, as a ratio of the mech's height: the weight goes down as the fist lands.
export const punchSink = (m: MotionState): number =>
  key(m.swing, [
    [0, 0],
    [MELEE_TUNE.windupSec, MOTION_TUNE.punchDip * 0.25],
    [meleeHitSec(), MOTION_TUNE.punchDip],
    [swingEndSec(), MOTION_TUNE.punchDip * 0.6],
    [meleeBlowSec(), 0],
  ]);

// How far the body has sunk, as a ratio of the mech's height; the landing's dip and the blow's both count.
export const dipDepth = (m: MotionState): number => MOTION_TUNE.landDip * m.dip * m.dip + punchSink(m);

// The flame's length as a ratio of the mech's height; 0 when it should not be drawn.
export const flameLength = (m: MotionState): number =>
  m.boost > MOTION_TUNE.flameShow ? MOTION_TUNE.flameLength * m.boost : 0;
