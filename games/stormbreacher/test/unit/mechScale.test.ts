import { expect, test } from 'vitest';
import { CAMERA_TUNE, MOVE_TUNE } from '../../src/data/tune.ts';
import { MECH_BASE_HEIGHT, scaleForMech } from '../../src/logic/mechScale.ts';

const ALL_ON = { camera: true, move: true };

test('a 4 m mech keeps every value as it is', () => {
  expect(MECH_BASE_HEIGHT).toBe(4);
  const scale = scaleForMech(MECH_BASE_HEIGHT, MOVE_TUNE, CAMERA_TUNE, ALL_ON);
  expect(scale.moveTune).toEqual(MOVE_TUNE);
  expect(scale.cameraTune).toEqual(CAMERA_TUNE);
});

test('an 8 m mech gets the 8 m values from before SB-100 back', () => {
  const scale = scaleForMech(8, MOVE_TUNE, CAMERA_TUNE, ALL_ON);
  expect(scale.moveTune.walk).toBeCloseTo(15, 10);
  expect(scale.moveTune.accel).toBeCloseTo(80, 10);
  expect(scale.moveTune.boost).toBeCloseTo(30, 10);
  expect(scale.moveTune.boostAccel).toBeCloseTo(160, 10);
  expect(scale.moveTune.jump).toBeCloseTo(MOVE_TUNE.jump * Math.sqrt(2), 9);
  expect(scale.moveTune.gravity).toBe(MOVE_TUNE.gravity);
  expect(scale.moveTune.turn).toBe(MOVE_TUNE.turn);

  expect(scale.cameraTune.dist).toBeCloseTo(17.2, 10);
  expect(scale.cameraTune.height).toBeCloseTo(3, 10);
  expect(scale.cameraTune.shoulder).toBeCloseTo(4.3, 10);
  expect(scale.cameraTune.lookHeight).toBeCloseTo(5.8, 10);
  expect(scale.cameraTune.aimDist).toBeCloseTo(10.2, 10);
  expect(scale.cameraTune.fov).toBe(CAMERA_TUNE.fov);
});

test('turning the camera proportion off keeps CAMERA_TUNE', () => {
  const scale = scaleForMech(8, MOVE_TUNE, CAMERA_TUNE, { camera: false, move: true });
  expect(scale.cameraTune).toEqual(CAMERA_TUNE);
  expect(scale.moveTune.walk).toBeCloseTo(MOVE_TUNE.walk * 2, 10);
});

test('turning the movement proportion off keeps MOVE_TUNE', () => {
  const scale = scaleForMech(8, MOVE_TUNE, CAMERA_TUNE, { camera: true, move: false });
  expect(scale.moveTune).toEqual(MOVE_TUNE);
  expect(scale.cameraTune.dist).toBeCloseTo(CAMERA_TUNE.dist * 2, 10);
});

test('turning both proportions off changes nothing', () => {
  const scale = scaleForMech(8, MOVE_TUNE, CAMERA_TUNE, { camera: false, move: false });
  expect(scale.moveTune).toEqual(MOVE_TUNE);
  expect(scale.cameraTune).toEqual(CAMERA_TUNE);
});
