import { expect, test } from 'vitest';
import * as THREE from 'three';
import { scene } from '@engine/render/index.ts';
import { BOOM_CAP, BOOM_DEFS, BOOM_SHAKE, boomShakeAt } from '../../src/data/boom.ts';
import { boomCounts, buildBooms, clearBooms, drawBooms, freeSlot, spawnBoom } from '../../src/view/boom.ts';
import { SEA_LEVEL } from '../../src/view/shore.ts';

const BOUNDS = { minX: -100, maxX: 100, minZ: -170, maxZ: 170 };

function baseY(meshName: string): number {
  const mesh = scene.getObjectByName(meshName);
  if (!(mesh instanceof THREE.InstancedMesh)) throw new Error(`the scene has no ${meshName} pool`);
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  return matrix.elements[13];
}

test('a full pool keeps exactly its cap of parts, not more', () => {
  buildBooms(BOUNDS);
  for (let i = 0; i < 2000; i++) spawnBoom('small', 0, 0.4, 0);
  const live = boomCounts();
  // 2000 blasts of 10 smoke puffs and 18 pieces fill every pool; the fire pool fills after 20
  expect(live.fire).toBe(BOOM_CAP.fire);
  expect(live.smoke).toBe(BOOM_CAP.smoke);
  expect(live.debris).toBe(BOOM_CAP.debris);
  expect(live.sand).toBe(BOOM_CAP.column);
  expect(live.water).toBe(0);
});

test('a new part takes a dead slot before it takes one still in use', () => {
  buildBooms(BOUNDS);
  clearBooms();
  // alternate short-lived and long-lived flashes: after half a second the even slots are dead and the odd ones live
  for (let i = 0; i < BOOM_CAP.fire; i++) spawnBoom(i % 2 === 0 ? 'small' : 'craft', 0, 0.4, 0);
  drawBooms(0.5);
  expect(boomCounts().fire).toBe(BOOM_CAP.fire / 2);
  // the first new flash fills a dead slot; the second must fill another dead slot, not a live craft's flash
  spawnBoom('small', 0, 0.4, 0);
  spawnBoom('small', 0, 0.4, 0);
  expect(boomCounts().fire).toBe(BOOM_CAP.fire / 2 + 2);
});

test('freeSlot picks the first dead slot, and the oldest only when every slot is live', () => {
  expect(freeSlot([{ live: true }, { live: false }, { live: true }], 0)).toBe(1);
  expect(freeSlot([{ live: true }, { live: true }, { live: false }], 1)).toBe(2);
  // every slot live: the oldest at `next` goes
  expect(freeSlot([{ live: true }, { live: true }, { live: true }], 2)).toBe(2);
  expect(freeSlot([{ live: false }], 0)).toBe(0);
});

test('a water column stands on the sea’s surface, whatever height the blast was given', () => {
  buildBooms(BOUNDS);
  clearBooms();
  spawnBoom('water', 0, 8, BOUNDS.maxZ + 20);
  drawBooms(0);
  expect(baseY('sb-boom-water')).toBeCloseTo(SEA_LEVEL);
});

test('a sand column stands where the blast was put', () => {
  buildBooms(BOUNDS);
  clearBooms();
  spawnBoom('large', 0, 2, BOUNDS.maxZ - 20);
  drawBooms(0);
  expect(baseY('sb-boom-sand')).toBeCloseTo(2);
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
