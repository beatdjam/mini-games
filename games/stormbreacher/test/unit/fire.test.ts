import { expect, test } from 'vitest';
import { fireRay, type Aabb } from '../../src/logic/fire.ts';

const box = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Aabb => ({
  minX,
  minY,
  minZ,
  maxX,
  maxY,
  maxZ,
});

test('a box straight ahead is hit', () => {
  const target = box(-2, 0, -10, 2, 8, -8);
  expect(fireRay(0, 5, 0, 0, 0, -1, 200, [target])).toBe(0);
});

test('a box out to the side is missed', () => {
  const target = box(3, 0, -10, 7, 8, -8);
  expect(fireRay(0, 5, 0, 0, 0, -1, 200, [target])).toBe(-1);
});

test('a box past the range is missed', () => {
  const target = box(-2, 0, -10, 2, 8, -8);
  expect(fireRay(0, 5, 0, 0, 0, -1, 5, [target])).toBe(-1);
});

test('with two boxes the nearer one comes back, whatever the order', () => {
  const near = box(-2, 0, -6, 2, 8, -4);
  const far = box(-2, 0, -16, 2, 8, -14);
  expect(fireRay(0, 5, 0, 0, 0, -1, 200, [far, near])).toBe(1);
  expect(fireRay(0, 5, 0, 0, 0, -1, 200, [near, far])).toBe(0);
});

test('the direction does not have to be normalized', () => {
  const target = box(-2, 0, -10, 2, 8, -8);
  expect(fireRay(0, 5, 0, 0, 0, -3, 200, [target])).toBe(0);
});
