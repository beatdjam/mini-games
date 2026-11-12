import { expect, test } from 'vitest';
import { BOOM_CAP, BOOM_DEFS, BOOM_SHAKE, boomShakeAt } from '../../src/data/boom.ts';
import { boomCounts, buildBooms, clearBooms, drawBooms, spawnBoom } from '../../src/view/boom.ts';

const BOUNDS = { minX: -100, maxX: 100, minZ: -170, maxZ: 170 };

test('a full pool reuses its oldest parts instead of growing', () => {
  buildBooms(BOUNDS);
  for (let i = 0; i < 2000; i++) spawnBoom('small', 0, 0.4, 0);
  const live = boomCounts();
  expect(live.fire).toBeLessThanOrEqual(BOOM_CAP.fire);
  expect(live.smoke).toBeLessThanOrEqual(BOOM_CAP.smoke);
  expect(live.debris).toBeLessThanOrEqual(BOOM_CAP.debris);
  expect(live.sand).toBeLessThanOrEqual(BOOM_CAP.column);
  expect(live.fire + live.smoke + live.debris + live.sand + live.water).toBeLessThanOrEqual(
    BOOM_CAP.fire + BOOM_CAP.smoke + BOOM_CAP.debris + BOOM_CAP.column * 2,
  );
});

test('a blast is gone once its life is over', () => {
  buildBooms(BOUNDS);
  spawnBoom('large', 0, 0.4, 0);
  expect(boomCounts().fire).toBe(1);
  drawBooms(BOOM_DEFS.large.fire.life / 2);
  expect(boomCounts().fire).toBe(1);
  drawBooms(20);
  expect(boomCounts()).toEqual({ fire: 0, smoke: 0, debris: 0, sand: 0, water: 0 });
});

test('a blast past the map’s front edge lifts water, not sand', () => {
  buildBooms(BOUNDS);
  clearBooms();
  spawnBoom('large', 0, 0.4, BOUNDS.maxZ + 20);
  const live = boomCounts();
  expect(live.water).toBe(1);
  expect(live.sand).toBe(0);
});

test('a blast on the beach lifts sand', () => {
  buildBooms(BOUNDS);
  clearBooms();
  spawnBoom('large', 0, 0.4, BOUNDS.maxZ - 20);
  const live = boomCounts();
  expect(live.sand).toBe(1);
  expect(live.water).toBe(0);
});

test('a farther blast shakes the camera less, and one past the far distance not at all', () => {
  const near = boomShakeAt('large', BOOM_SHAKE.near);
  const middle = boomShakeAt('large', (BOOM_SHAKE.near + BOOM_SHAKE.far) / 2);
  const far = boomShakeAt('large', BOOM_SHAKE.far);
  expect(near).toBeCloseTo(BOOM_DEFS.large.shake);
  expect(middle).toBeLessThan(near);
  expect(middle).toBeGreaterThan(0);
  expect(far).toBe(0);
  expect(boomShakeAt('large', BOOM_SHAKE.far + 50)).toBe(0);
});
