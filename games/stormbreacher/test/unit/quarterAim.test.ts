import { expect, test } from 'vitest';
import { QUARTER_TUNE } from '../../src/data/tune.ts';
import { quarterAimInput } from '../../src/dev/quarterAim.ts';
import { groundPoint, quarterPose } from '../../src/view/quarterCamera.ts';

const MECH = { x: 0, y: 0, z: 0, yaw: 0 };
const ASPECT = 16 / 9;

test('with no pose the mech keeps its yaw and moves with the azimuth', () => {
  const input = quarterAimInput(
    null,
    QUARTER_TUNE.fov,
    ASPECT,
    { x: 0, y: 0 },
    { ...MECH, yaw: 1.2 },
    QUARTER_TUNE.azimuth,
  );
  expect(input).toEqual({ frame: QUARTER_TUNE.azimuth, face: 1.2 });
});

test('the middle of the screen aims the mech at the point ahead', () => {
  const pose = quarterPose(MECH, QUARTER_TUNE);
  const at = groundPoint(pose, QUARTER_TUNE.fov, ASPECT, { x: 0, y: 0 }, MECH.y);
  expect(at).not.toBeNull();
  // no cursor is the middle of the screen
  const input = quarterAimInput(pose, QUARTER_TUNE.fov, ASPECT, null, MECH, QUARTER_TUNE.azimuth);
  expect(input.frame).toBe(QUARTER_TUNE.azimuth);
  expect(input.face).toBeCloseTo(Math.atan2(-(at!.x - MECH.x), -(at!.z - MECH.z)), 9);
});

test('a cursor to the right turns the mech right', () => {
  const pose = quarterPose(MECH, QUARTER_TUNE);
  const middle = quarterAimInput(pose, QUARTER_TUNE.fov, ASPECT, { x: 0, y: 0 }, MECH, QUARTER_TUNE.azimuth);
  const right = quarterAimInput(pose, QUARTER_TUNE.fov, ASPECT, { x: 0.5, y: 0 }, MECH, QUARTER_TUNE.azimuth);
  // the yaw grows turning left, so a point to the right gives the smaller face
  expect(right.face!).toBeLessThan(middle.face!);
  // and the face is the direction of the point the cursor finds
  const at = groundPoint(pose, QUARTER_TUNE.fov, ASPECT, { x: 0.5, y: 0 }, MECH.y)!;
  expect(right.face).toBeCloseTo(Math.atan2(-(at.x - MECH.x), -(at.z - MECH.z)), 9);
});

test('a point above the horizon keeps the yaw', () => {
  const pose = quarterPose(MECH, QUARTER_TUNE);
  // a wide enough fov lifts the top edge of the screen above level
  expect(groundPoint(pose, 150, ASPECT, { x: 0, y: 1 }, MECH.y)).toBeNull();
  const input = quarterAimInput(pose, 150, ASPECT, { x: 0, y: 1 }, { ...MECH, yaw: 0.4 }, QUARTER_TUNE.azimuth);
  expect(input).toEqual({ frame: QUARTER_TUNE.azimuth, face: 0.4 });
});

test('a point nearer than 0.9 m keeps the yaw', () => {
  const pose = quarterPose(MECH, QUARTER_TUNE);
  const at = groundPoint(pose, QUARTER_TUNE.fov, ASPECT, { x: 0, y: 0 }, MECH.y)!;
  const near = { x: at.x + 0.5, y: MECH.y, z: at.z, yaw: -0.7 };
  const input = quarterAimInput(pose, QUARTER_TUNE.fov, ASPECT, null, near, QUARTER_TUNE.azimuth);
  expect(input).toEqual({ frame: QUARTER_TUNE.azimuth, face: -0.7 });
});
