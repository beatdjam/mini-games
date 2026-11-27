import { expect, test } from 'vitest';
import { MOVE_TUNE } from '../../src/data/tune.ts';
import { newMech, stepMech, type MechInput } from '../../src/logic/mech.ts';
import { dragAimPoint, screenToGround, touchAimInput } from '../../src/logic/touchAim.ts';

const AZ = Math.PI / 4;
const TUNE = { aimReach: 20, aimDeadzone: 16 };

const idle: MechInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
};

test('the screen’s top and right become ground directions with the camera’s azimuth', () => {
  const up = screenToGround(0, -1, 0);
  expect(up.x).toBeCloseTo(0, 10);
  expect(up.z).toBeCloseTo(-1, 10);
  const right = screenToGround(1, 0, 0);
  expect(right.x).toBeCloseTo(1, 10);
  expect(right.z).toBeCloseTo(0, 10);

  const upQuarter = screenToGround(0, -1, AZ);
  expect(upQuarter.x).toBeCloseTo(-Math.sin(AZ), 10);
  expect(upQuarter.z).toBeCloseTo(-Math.cos(AZ), 10);
  const rightQuarter = screenToGround(1, 0, AZ);
  expect(rightQuarter.x).toBeCloseTo(Math.cos(AZ), 10);
  expect(rightQuarter.z).toBeCloseTo(-Math.sin(AZ), 10);
});

test('a drag inside the deadzone aims at no point', () => {
  expect(dragAimPoint({ x: 1, z: 2 }, { x: 10, y: 10 }, AZ, TUNE)).toBeNull();
  expect(dragAimPoint({ x: 1, z: 2 }, { x: 16, y: 0 }, AZ, TUNE)).toBeNull();
});

test('a drag aims at a point aimReach away in its screen direction', () => {
  const mech = { x: 3, z: -4 };
  const up = dragAimPoint(mech, { x: 0, y: -40 }, 0, TUNE)!;
  expect(up.x).toBeCloseTo(mech.x, 10);
  expect(up.z).toBeCloseTo(mech.z - TUNE.aimReach, 10);

  const right = dragAimPoint(mech, { x: 60, y: 0 }, 0, TUNE)!;
  expect(right.x).toBeCloseTo(mech.x + TUNE.aimReach, 10);
  expect(right.z).toBeCloseTo(mech.z, 10);

  const upQuarter = dragAimPoint(mech, { x: 0, y: -40 }, AZ, TUNE)!;
  expect(upQuarter.x - mech.x).toBeCloseTo(-TUNE.aimReach * Math.sin(AZ), 10);
  expect(upQuarter.z - mech.z).toBeCloseTo(-TUNE.aimReach * Math.cos(AZ), 10);

  const diagonal = dragAimPoint(mech, { x: 30, y: -30 }, 0, TUNE)!;
  expect(Math.hypot(diagonal.x - mech.x, diagonal.z - mech.z)).toBeCloseTo(TUNE.aimReach, 10);
  expect(diagonal.x - mech.x).toBeCloseTo(TUNE.aimReach / Math.SQRT2, 10);
  expect(diagonal.z - mech.z).toBeCloseTo(-TUNE.aimReach / Math.SQRT2, 10);
});

test('without a right touch the mech keeps the yaw it last aimed at', () => {
  const mech = { x: 0, z: 0 };
  expect(touchAimInput({ mech, yaw: 1.2, azimuth: AZ, drag: null, tune: TUNE })).toEqual({ frame: AZ, face: 1.2 });
  // a drag inside the deadzone counts as no touch of the right side
  expect(touchAimInput({ mech, yaw: 1.2, azimuth: AZ, drag: { x: 3, y: 4 }, tune: TUNE })).toEqual({
    frame: AZ,
    face: 1.2,
  });
});

test('walking with the stick alone moves on the screen frame and does not turn the aim', () => {
  const mech = newMech();
  const before = mech.yaw;
  const { frame, face } = touchAimInput({ mech, yaw: mech.yaw, azimuth: AZ, drag: null, tune: TUNE });
  stepMech(mech, { ...idle, moveZ: 1, frame, face }, 0.1, MOVE_TUNE, 0);
  expect(mech.yaw).toBeCloseTo(before, 10);
  // up on the stick is up on the screen: -z and -x at azimuth PI/4
  expect(mech.x).toBeLessThan(0);
  expect(mech.z).toBeLessThan(0);
});
