import { expect, test } from 'vitest';
import { CAMERA_TUNE, MOVE_TUNE } from '../../src/data/tune.ts';
import { MECH_BASE_HEIGHT, scaleForMech } from '../../src/logic/mechScale.ts';

const ALL_ON = { camera: true, move: true };

test('an 8 m mech keeps every value as it is', () => {
  const scale = scaleForMech(MECH_BASE_HEIGHT, MOVE_TUNE, CAMERA_TUNE, ALL_ON);
  expect(scale.moveTune).toEqual(MOVE_TUNE);
  expect(scale.cameraTune).toEqual(CAMERA_TUNE);
});

test('a 4 m mech halves the distances and speeds, and its jump starts at sqrt(0.5)', () => {
  const scale = scaleForMech(4, MOVE_TUNE, CAMERA_TUNE, ALL_ON);
  expect(scale.moveTune.walk).toBeCloseTo(MOVE_TUNE.walk / 2, 10);
  expect(scale.moveTune.accel).toBeCloseTo(MOVE_TUNE.accel / 2, 10);
  expect(scale.moveTune.boost).toBeCloseTo(MOVE_TUNE.boost / 2, 10);
  expect(scale.moveTune.boostAccel).toBeCloseTo(MOVE_TUNE.boostAccel / 2, 10);
  expect(scale.moveTune.jump).toBeCloseTo(MOVE_TUNE.jump * Math.sqrt(0.5), 10);
  expect(scale.moveTune.gravity).toBe(MOVE_TUNE.gravity);
  expect(scale.moveTune.turn).toBe(MOVE_TUNE.turn);

  expect(scale.cameraTune.dist).toBeCloseTo(CAMERA_TUNE.dist / 2, 10);
  expect(scale.cameraTune.height).toBeCloseTo(CAMERA_TUNE.height / 2, 10);
  expect(scale.cameraTune.shoulder).toBeCloseTo(CAMERA_TUNE.shoulder / 2, 10);
  expect(scale.cameraTune.lookHeight).toBeCloseTo(CAMERA_TUNE.lookHeight / 2, 10);
  expect(scale.cameraTune.aimDist).toBeCloseTo(CAMERA_TUNE.aimDist / 2, 10);
  expect(scale.cameraTune.fov).toBe(CAMERA_TUNE.fov);
});

test('turning the camera proportion off keeps CAMERA_TUNE', () => {
  const scale = scaleForMech(4, MOVE_TUNE, CAMERA_TUNE, { camera: false, move: true });
  expect(scale.cameraTune).toEqual(CAMERA_TUNE);
  expect(scale.moveTune.walk).toBeCloseTo(MOVE_TUNE.walk / 2, 10);
});

test('turning the movement proportion off keeps MOVE_TUNE', () => {
  const scale = scaleForMech(4, MOVE_TUNE, CAMERA_TUNE, { camera: true, move: false });
  expect(scale.moveTune).toEqual(MOVE_TUNE);
  expect(scale.cameraTune.dist).toBeCloseTo(CAMERA_TUNE.dist / 2, 10);
});

test('turning both proportions off changes nothing', () => {
  const scale = scaleForMech(4, MOVE_TUNE, CAMERA_TUNE, { camera: false, move: false });
  expect(scale.moveTune).toEqual(MOVE_TUNE);
  expect(scale.cameraTune).toEqual(CAMERA_TUNE);
});
