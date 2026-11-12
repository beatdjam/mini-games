// The ramp: one slanted rect whose surface climbs in a straight line towards -z (turned by the prop's yaw), low enough
// at its seaward end to be walked onto and high enough on the sides to be a wall, with a slope under the walkable limit.
import { expect, test } from 'vitest';
import { PROP_SIZE, RAMP_TUNE } from '../../src/data/props.ts';
import type { MapDef, Prop } from '../../src/data/types.ts';
import { groundAt, pushOutCircle } from '../../src/logic/collide.ts';
import { mapBlockers } from '../../src/logic/mapShapes.ts';

const HALF_D = PROP_SIZE.ramp.d / 2;

function mapOf(props: Prop[]): MapDef {
  return { id: 'ramp-test', bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, props, targets: [], spawns: {} };
}

const ramp = (over: Partial<Prop> = {}): Prop => ({ kind: 'ramp', x: 10, z: 20, yaw: 0, scale: 1, ...over });

test('a ramp is one slanted rect, low at its +z edge and high at its -z edge', () => {
  const rects = mapBlockers(mapOf([ramp()]));
  expect(rects).toHaveLength(1);
  expect(rects[0].ramp).toBe(true);
  expect(rects[0].top).toBeCloseTo(PROP_SIZE.ramp.h, 9);
  expect(groundAt(10, 20 + HALF_D, 0.5, rects, 100)).toBeCloseTo(0, 9);
  expect(groundAt(10, 20, 0.5, rects, 100)).toBeCloseTo(PROP_SIZE.ramp.h / 2, 9);
  expect(groundAt(10, 20 - HALF_D, 0.5, rects, 100)).toBeCloseTo(PROP_SIZE.ramp.h, 9);
});

test('turning the ramp a quarter turn climbs towards -x', () => {
  const rects = mapBlockers(mapOf([ramp({ yaw: Math.PI / 2 })]));
  expect(groundAt(10, 20, 0.5, rects, 100)).toBeCloseTo(PROP_SIZE.ramp.h / 2, 9);
  expect(groundAt(10 - HALF_D, 20, 0.5, rects, 100)).toBeCloseTo(PROP_SIZE.ramp.h, 9);
  expect(groundAt(10 + HALF_D, 20, 0.5, rects, 100)).toBeCloseTo(0, 9);
});

test('a ramp face above the feet does not hold the mech up', () => {
  const rects = mapBlockers(mapOf([ramp()]));
  expect(groundAt(10, 20 - HALF_D / 2, 0.5, rects, 1)).toBe(0);
});

test('the side of a ramp is a wall while its low end is walked onto', () => {
  const rects = mapBlockers(mapOf([ramp()]));
  const side = 10 + PROP_SIZE.ramp.w / 2;
  const pushed = pushOutCircle(side + 0.5, 20, 1, rects, 0.75);
  expect(pushed.x).toBeCloseTo(side + 1, 6);
  expect(pushed.z).toBeCloseTo(20, 6);
  const low = pushOutCircle(10, 20 + HALF_D + 0.5, 1, rects, 0.75);
  expect(low.hits).toHaveLength(0);
  expect(low.x).toBeCloseTo(10, 6);
  expect(low.z).toBeCloseTo(20 + HALF_D + 0.5, 6);
});

test('the ramp stays under the walkable slope limit', () => {
  const slope = (Math.atan2(PROP_SIZE.ramp.h, PROP_SIZE.ramp.d) * 180) / Math.PI;
  expect(slope).toBeLessThanOrEqual(RAMP_TUNE.maxSlopeDeg);
  expect(RAMP_TUNE.maxSlopeDeg).toBeGreaterThan(0);
  expect(RAMP_TUNE.maxSlopeDeg).toBeLessThan(45);
});
