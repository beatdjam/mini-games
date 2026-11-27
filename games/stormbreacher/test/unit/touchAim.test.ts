import { expect, test } from 'vitest';
import { MOVE_TUNE } from '../../src/data/tune.ts';
import { newMech, stepMech, type MechInput } from '../../src/logic/mech.ts';
import { dragAimPoint, screenToGround, stickFace } from '../../src/logic/touchAim.ts';

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

test('the stick faces the screen direction it is pushed, and holds the yaw at rest', () => {
  expect(stickFace({ moveX: 0, moveZ: 1 }, 0, 1.2, 0.05)).toBeCloseTo(0, 10);
  expect(stickFace({ moveX: 0, moveZ: 1 }, AZ, 1.2, 0.05)).toBeCloseTo(AZ, 10);
  // up and right together point up-right on the screen: -z and +x at azimuth 0
  expect(stickFace({ moveX: 1, moveZ: 1 }, 0, 1.2, 0.05)).toBeCloseTo(-Math.PI / 4, 10);
  expect(stickFace({ moveX: 0.01, moveZ: -0.01 }, AZ, 1.2, 0.05)).toBe(1.2);
});

test('a stick face turns the mech so it moves the same way as the screen frame', () => {
  const framed = newMech();
  const faced = newMech();
  const face = stickFace({ moveX: 0, moveZ: 1 }, AZ, faced.yaw, 0.05);
  stepMech(framed, { ...idle, moveZ: 1, frame: AZ }, 0.1, MOVE_TUNE, 0);
  stepMech(faced, { ...idle, moveZ: 1, face }, 0.1, MOVE_TUNE, 0);
  expect(faced.yaw).toBeCloseTo(AZ, 10);
  expect(faced.x).toBeCloseTo(framed.x, 10);
  expect(faced.z).toBeCloseTo(framed.z, 10);
});
