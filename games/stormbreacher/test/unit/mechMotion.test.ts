import { expect, test } from 'vitest';
import { GAIT_LOOK } from '../../src/data/mech.ts';
import { MOTION_TUNE } from '../../src/data/tune.ts';
import {
  dipDepth,
  flameLength,
  leanAngle,
  legAngle,
  legOffset,
  newMotion,
  recoilBack,
  stepMotion,
  type MotionInput,
  type MotionState,
} from '../../src/view/mechMotion.ts';

const DT = 1 / 60;
const STRIDE = 3;
const standing: MotionInput = { speed: 0, grounded: true, boosting: false, landSpeed: null, fired: false };
const walking: MotionInput = { ...standing, speed: 7.5 };

function run(m: MotionState, input: MotionInput, seconds: number) {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepMotion(m, input, DT, STRIDE);
}

test('walking swings the legs, and the left and right are opposite', () => {
  const m = newMotion();
  run(m, walking, 0.37);
  const right = legAngle(m, 'biped', GAIT_LOOK.biped, 1, 0);
  const left = legAngle(m, 'biped', GAIT_LOOK.biped, -1, 0);
  expect(Math.abs(right)).toBeGreaterThan(0.05);
  expect(Math.abs(right)).toBeLessThanOrEqual(GAIT_LOOK.biped.swing + 1e-9);
  expect(left).toBeCloseTo(-right, 10);
});

test('standing still keeps the legs at 0 and does not advance the cycle', () => {
  const m = newMotion();
  run(m, standing, 1);
  expect(m.phase).toBe(0);
  expect(legAngle(m, 'biped', GAIT_LOOK.biped, 1, 0)).toBeCloseTo(0, 10);
});

test('the legs come back to 0 when the mech stops', () => {
  const m = newMotion();
  run(m, walking, 1);
  expect(m.walk).toBe(1);
  run(m, standing, 1);
  expect(m.walk).toBe(0);
  for (const sx of [1, -1]) expect(legAngle(m, 'biped', GAIT_LOOK.biped, sx, 0)).toBeCloseTo(0, 10);
});

test('a faster walk covers a cycle faster', () => {
  const slow = newMotion();
  const fast = newMotion();
  stepMotion(slow, { ...walking, speed: 3 }, DT, STRIDE);
  stepMotion(fast, walking, DT, STRIDE);
  expect(fast.phase).toBeGreaterThan(slow.phase);
});

test('the multi legs pair the diagonal ones', () => {
  expect(legOffset('multi', 1, 1)).toBe(legOffset('multi', -1, -1));
  expect(legOffset('multi', 1, -1)).toBe(legOffset('multi', -1, 1));
  expect(legOffset('multi', 1, 1)).not.toBe(legOffset('multi', 1, -1));
  const m = newMotion();
  run(m, walking, 0.3);
  const look = GAIT_LOOK.multi;
  expect(legAngle(m, 'multi', look, 1, 1)).toBeCloseTo(legAngle(m, 'multi', look, -1, -1), 10);
  expect(legAngle(m, 'multi', look, 1, -1)).toBeCloseTo(-legAngle(m, 'multi', look, 1, 1), 10);
});

test('the legs tuck back in the air and come down on landing', () => {
  const m = newMotion();
  run(m, { ...standing, grounded: false }, 1);
  expect(legAngle(m, 'reverse', GAIT_LOOK.reverse, 1, 0)).toBeCloseTo(-GAIT_LOOK.reverse.bend, 10);
  run(m, standing, 1);
  expect(legAngle(m, 'reverse', GAIT_LOOK.reverse, 1, 0)).toBeCloseTo(0, 10);
});

test('boosting leans the body and shows the flame, and both go when it ends', () => {
  const m = newMotion();
  expect(leanAngle(m)).toBeCloseTo(0, 10);
  expect(flameLength(m)).toBe(0);
  run(m, { ...standing, boosting: true }, 1);
  expect(leanAngle(m)).toBeCloseTo(-MOTION_TUNE.lean, 10);
  expect(flameLength(m)).toBeCloseTo(MOTION_TUNE.flameLength, 10);
  run(m, standing, 1);
  expect(leanAngle(m)).toBeCloseTo(0, 10);
  expect(flameLength(m)).toBe(0);
});

test('a shot pulls the arms back and they return over recoilTime', () => {
  const m = newMotion();
  stepMotion(m, { ...standing, fired: true }, DT, STRIDE);
  expect(recoilBack(m)).toBeCloseTo(MOTION_TUNE.recoilBack, 10);
  run(m, standing, MOTION_TUNE.recoilTime / 2);
  expect(recoilBack(m)).toBeGreaterThan(0);
  expect(recoilBack(m)).toBeLessThan(MOTION_TUNE.recoilBack);
  run(m, standing, MOTION_TUNE.recoilTime);
  expect(recoilBack(m)).toBe(0);
});

test('a landing sinks the body by how fast it fell, then it comes back up', () => {
  const soft = newMotion();
  const hard = newMotion();
  stepMotion(soft, { ...standing, landSpeed: MOTION_TUNE.landSpeed / 2 }, DT, STRIDE);
  stepMotion(hard, { ...standing, landSpeed: MOTION_TUNE.landSpeed * 3 }, DT, STRIDE);
  expect(dipDepth(soft)).toBeGreaterThan(0);
  expect(dipDepth(hard)).toBeGreaterThan(dipDepth(soft));
  expect(dipDepth(hard)).toBeLessThanOrEqual(MOTION_TUNE.landDip);
  run(hard, standing, MOTION_TUNE.landTime + 0.1);
  expect(dipDepth(hard)).toBe(0);
});
