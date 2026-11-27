import { expect, test } from 'vitest';
import { MOVE_TUNE } from '../../src/data/tune.ts';
import { MECH_BASE_HEIGHT, scaleForMech } from '../../src/logic/mechScale.ts';

test('a 4 m mech keeps every value as it is', () => {
  expect(MECH_BASE_HEIGHT).toBe(4);
  const scale = scaleForMech(MECH_BASE_HEIGHT, MOVE_TUNE, { move: true });
  expect(scale.moveTune).toEqual(MOVE_TUNE);
});

test('an 8 m mech doubles the 4 m walking and boost values and raises the jump by a square root', () => {
  const scale = scaleForMech(8, MOVE_TUNE, { move: true });
  expect(scale.moveTune.walk).toBeCloseTo(MOVE_TUNE.walk * 2, 10);
  expect(scale.moveTune.accel).toBeCloseTo(MOVE_TUNE.accel * 2, 10);
  expect(scale.moveTune.boost).toBeCloseTo(MOVE_TUNE.boost * 2, 10);
  expect(scale.moveTune.boostAccel).toBeCloseTo(MOVE_TUNE.boostAccel * 2, 10);
  expect(scale.moveTune.jump).toBeCloseTo(MOVE_TUNE.jump * Math.sqrt(2), 9);
  expect(scale.moveTune.gravity).toBe(MOVE_TUNE.gravity);
  expect(scale.moveTune.turn).toBe(MOVE_TUNE.turn);
});

test('turning the movement proportion off keeps MOVE_TUNE', () => {
  const scale = scaleForMech(8, MOVE_TUNE, { move: false });
  expect(scale.moveTune).toEqual(MOVE_TUNE);
});
