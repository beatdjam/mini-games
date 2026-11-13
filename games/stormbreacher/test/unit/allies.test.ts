import { expect, test } from 'vitest';
import { ALLY_FATES, ALLY_TUNE } from '../../src/data/allies.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { enemyTracerTargets, moveAlly, nearestIndex, newAlly, stepAlly } from '../../src/logic/allies.ts';

const DT = 1 / 60;
const WAY = M1.paths['beach-run'];
const FATE = { place: M1.places['beach-mid'], by: 'mortar' as const, call: null };

test('the ally starts at the first point of its way, facing the second, on the ground and not yet called', () => {
  const ally = newAlly('buddy', WAY, FATE);
  expect([ally.x, ally.z]).toEqual([WAY[0].x, WAY[0].z]);
  expect(ally.y).toBe(0);
  expect(ally.called).toBe(false);
  expect(ally.down).toBe(false);
  // the way goes toward -z and +x: the yaw (0 faces -z) turns to -x's side
  expect(ally.yaw).toBeLessThan(0);
});

test('the fates an ally may fall by are the mortar and the gun', () => {
  expect(ALLY_FATES).toEqual(['mortar', 'gun']);
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

test('moving an ally swaps its way, starts at the next point and faces on from where it stands', () => {
  const ally = newAlly('cover-b1', M1.paths['b1-run'], null);
  stepAlly(ally, 60 / ALLY_TUNE.speed); // 60 m along the way, so it stands away from the first point
  const from = { x: ally.x, z: ally.z };
  const next = M1.paths['c1-run'];
  moveAlly(ally, next);
  expect(ally.next).toBe(1);
  // the state does not jump to the new way's first point: it runs on from where it stood
  expect([ally.x, ally.z]).toEqual([from.x, from.z]);
  // the new way is a copy, not the mission's list
  expect(ally.way).toEqual(next.map(point => ({ ...point })));
  expect(ally.way).not.toBe(next);
  expect(ally.yaw).toBeCloseTo(Math.atan2(-(next[1].x - from.x), -(next[1].z - from.z)), 6);
});

test('a fallen ally keeps the way and the place it fell at', () => {
  const ally = newAlly('buddy', WAY, FATE);
  while (!ally.down) stepAlly(ally, DT);
  const was = { way: ally.way, next: ally.next, x: ally.x, z: ally.z };
  moveAlly(ally, M1.paths['c1-run']);
  expect(ally.way).toBe(was.way);
  expect(ally.next).toBe(was.next);
  expect([ally.x, ally.z]).toEqual([was.x, was.z]);
});

test('moving an ally along a way with no point is refused', () => {
  const ally = newAlly('buddy', WAY, null);
  expect(() => moveAlly(ally, [])).toThrow(/no point/);
});

test('nearestIndex gives the nearest point within the range', () => {
  const points = [
    { x: 0, z: 10 },
    { x: 3, z: 4 },
    { x: -20, z: 0 },
  ];
  expect(nearestIndex({ x: 0, z: 0 }, points, 70)).toBe(1);
});

test('nearestIndex gives the first of points at the same distance', () => {
  const points = [
    { x: -3, z: 4 },
    { x: 3, z: 4 },
  ];
  expect(nearestIndex({ x: 0, z: 0 }, points, 70)).toBe(0);
});

test('nearestIndex gives null when every point is farther than the range', () => {
  expect(nearestIndex({ x: 0, z: 0 }, [{ x: 0, z: 5 }], 4)).toBeNull();
});

test('nearestIndex gives null for no points', () => {
  expect(nearestIndex({ x: 0, z: 0 }, [], 70)).toBeNull();
});

test('enemyTracerTargets picks a living, awake enemy’s nearest ally, and leaves the others out', () => {
  const allies = [
    { x: 0, z: 10 },
    { x: 0, z: -10 },
  ];
  const enemies = [
    { id: 'awake', x: 50, z: 0, hp: 1, awake: true },
    { id: 'asleep', x: 50, z: 0, hp: 1, awake: false },
    { id: 'dead', x: 50, z: 0, hp: 0, awake: true },
    { id: 'far', x: 500, z: 0, hp: 1, awake: true },
  ];
  const targets = enemyTracerTargets(enemies, allies, 70, false);
  expect([...targets.keys()]).toEqual(['awake', 'far']);
  // both allies are 50 m away: the first of equal distances is the one nearestIndex gives
  expect(targets.get('awake')).toEqual(allies[0]);
  // an awake enemy with no ally in range still gets its timer, then fires nothing
  expect(targets.get('far')).toBeNull();
});

test('enemyTracerTargets shows nothing during a cutscene', () => {
  const targets = enemyTracerTargets([{ id: 'awake', x: 0, z: 0, hp: 1, awake: true }], [{ x: 0, z: 5 }], 70, true);
  expect(targets.size).toBe(0);
});
