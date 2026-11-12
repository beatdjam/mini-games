import { expect, test } from 'vitest';
import { ALLY_TUNE } from '../../src/data/allies.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { newAlly, stepAlly } from '../../src/logic/allies.ts';

const DT = 1 / 60;
const WAY = M1.paths['beach-run'];
const FATE = { place: M1.places['beach-mid'], by: 'mortar' };

test('the ally starts at the first point of its way, facing the second', () => {
  const ally = newAlly('buddy', WAY, FATE);
  expect([ally.x, ally.z]).toEqual([WAY[0].x, WAY[0].z]);
  expect(ally.down).toBe(false);
  // the way goes toward -z and +x: the yaw (0 faces -z) turns to -x's side
  expect(ally.yaw).toBeLessThan(0);
});

test('the ally runs at ALLY_TUNE.speed along the way', () => {
  const ally = newAlly(
    'buddy',
    [
      { x: 0, z: 100 },
      { x: 0, z: 0 },
    ],
    null,
  );
  for (let i = 0; i < 60; i++) stepAlly(ally, DT);
  expect(ally.z).toBeCloseTo(100 - ALLY_TUNE.speed, 6);
  expect(ally.x).toBe(0);
  expect(ally.yaw).toBeCloseTo(0, 6);
});

test('a long step still follows the corners of the way', () => {
  const ally = newAlly(
    'buddy',
    [
      { x: 0, z: 0 },
      { x: 0, z: -3 },
      { x: 4, z: -3 },
    ],
    null,
  );
  stepAlly(ally, 100 / ALLY_TUNE.speed);
  expect([ally.x, ally.z]).toEqual([4, -3]);
  expect(ally.next).toBe(3);
});

test('the ally falls once, at beach-mid, and does not move after', () => {
  const ally = newAlly('buddy', WAY, FATE);
  let falls = 0;
  let frames = 0;
  while (!ally.down && frames < 60 * 60) {
    if (stepAlly(ally, DT)) falls++;
    frames++;
  }
  expect(falls).toBe(1);
  expect(ally.down).toBe(true);
  expect(Math.hypot(ally.x - FATE.place.x, ally.z - FATE.place.z)).toBeLessThanOrEqual(ALLY_TUNE.arrive);
  const at = { x: ally.x, z: ally.z };
  for (let i = 0; i < 120; i++) expect(stepAlly(ally, DT)).toBe(false);
  expect({ x: ally.x, z: ally.z }).toEqual(at);
});

test('an ally with no fate runs to the end of its way and stays', () => {
  const ally = newAlly('buddy', WAY, null);
  for (let i = 0; i < 60 * 30; i++) expect(stepAlly(ally, DT)).toBe(false);
  const last = WAY[WAY.length - 1];
  expect([ally.x, ally.z]).toEqual([last.x, last.z]);
  expect(ally.down).toBe(false);
});

test('a way with no point is refused', () => {
  expect(() => newAlly('buddy', [], null)).toThrow(/no point/);
});
