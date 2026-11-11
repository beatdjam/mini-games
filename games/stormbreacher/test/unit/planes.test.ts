import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { PLANE_LIFT, PLANE_MARGIN, newPlane, stepPlane, type Plane } from '../../src/logic/planes.ts';

const BOUNDS = { minX: -100, maxX: 100, minZ: -60, maxZ: 170 };
const DT = 1 / 60;

test('a new plane starts inside the lane the bounds give', () => {
  for (let seed = 0; seed < 50; seed++) {
    const plane = newPlane(createRng(seed), BOUNDS);
    expect(plane.x).toBeGreaterThanOrEqual(BOUNDS.minX - PLANE_MARGIN);
    expect(plane.x).toBeLessThanOrEqual(BOUNDS.maxX + PLANE_MARGIN);
    expect(plane.z).toBeGreaterThanOrEqual(BOUNDS.minZ);
    expect(plane.z).toBeLessThanOrEqual(BOUNDS.maxZ);
    expect(Math.abs(plane.lift)).toBeLessThanOrEqual(PLANE_LIFT);
    expect([-1, 1]).toContain(plane.dir);
  }
});

test('a plane moves by its own speed and nothing else', () => {
  const plane: Plane = { x: 0, z: 10, lift: 3, dir: 1 };
  const rng = createRng(1);
  for (let i = 0; i < 60; i++) stepPlane(plane, rng, BOUNDS, 30, DT);
  // stepPlane takes no mech place, so the type of its arguments keeps the planes off the mech
  expect(plane.x).toBeCloseTo(30, 5);
  expect(plane.z).toBe(10);
  expect(plane.lift).toBe(3);
});

test('a plane that leaves turns round on the same side with a new depth and height', () => {
  const edge = BOUNDS.maxX + PLANE_MARGIN;
  const plane: Plane = { x: edge - 0.1, z: 10, lift: 3, dir: 1 };
  stepPlane(plane, createRng(2), BOUNDS, 30, DT);
  expect(plane.dir).toBe(-1);
  expect(plane.x).toBe(edge);
  expect(plane.z).toBeGreaterThanOrEqual(BOUNDS.minZ);
  expect(plane.z).toBeLessThanOrEqual(BOUNDS.maxZ);
});

test('the same seed gives the same planes', () => {
  const run = () => {
    const rng = createRng(9);
    const planes = Array.from({ length: 6 }, () => newPlane(rng, BOUNDS));
    for (let i = 0; i < 100; i++) for (const plane of planes) stepPlane(plane, rng, BOUNDS, 30, DT);
    return planes;
  };
  expect(run()).toEqual(run());
});
