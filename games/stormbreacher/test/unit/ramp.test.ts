// The ramp: one slanted rect whose surface climbs in a straight line towards -z (turned by the prop's yaw), low enough
// at its seaward end to be walked onto and high enough on the sides to be a wall, with a slope under the walkable limit.
// The expected heights and widths are the ticket's values (8 x 18 x 6 m), not numbers read back from the tables.
import { expect, test } from 'vitest';
import { PROP_SIZE, RAMP_TUNE } from '../../src/data/props.ts';
import type { MapDef, Prop } from '../../src/data/types.ts';
import { groundAt, pushOutCircle, rectBoxes } from '../../src/logic/collide.ts';
import { fireRayHit } from '../../src/logic/fire.ts';
import { newGame } from '../../src/logic/game.ts';
import { mapBlockers } from '../../src/logic/mapShapes.ts';

const WIDTH = 8;
const LENGTH = 18;
const HEIGHT = 6;
const HALF_D = LENGTH / 2;

function mapOf(props: Prop[]): MapDef {
  return { id: 'ramp-test', bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, props, targets: [], spawns: {} };
}

const ramp = (over: Partial<Prop> = {}): Prop => ({ kind: 'ramp', x: 10, z: 20, yaw: 0, scale: 1, ...over });

test('a ramp is one slanted rect, low at its +z edge and high at its -z edge', () => {
  const rects = mapBlockers(mapOf([ramp()]));
  expect(rects).toHaveLength(1);
  expect(rects[0].ramp).toBe(true);
  expect(rects[0].top).toBe(HEIGHT);
  expect(groundAt(10, 20 + HALF_D, 0.5, rects, 100)).toBeCloseTo(0, 9);
  expect(groundAt(10, 20, 0.5, rects, 100)).toBeCloseTo(HEIGHT / 2, 9);
  expect(groundAt(10, 20 - HALF_D, 0.5, rects, 100)).toBeCloseTo(HEIGHT, 9);
});

test('turning the ramp a quarter turn climbs towards -x', () => {
  const rects = mapBlockers(mapOf([ramp({ yaw: Math.PI / 2 })]));
  expect(groundAt(10, 20, 0.5, rects, 100)).toBeCloseTo(HEIGHT / 2, 9);
  expect(groundAt(10 - HALF_D, 20, 0.5, rects, 100)).toBeCloseTo(HEIGHT, 9);
  expect(groundAt(10 + HALF_D, 20, 0.5, rects, 100)).toBeCloseTo(0, 9);
});

test('a ramp face above the feet does not hold the mech up', () => {
  const rects = mapBlockers(mapOf([ramp()]));
  expect(groundAt(10, 20 - HALF_D / 2, 0.5, rects, 1)).toBe(0);
});

test('the side of a ramp is a wall while its low end is walked onto', () => {
  const rects = mapBlockers(mapOf([ramp()]));
  const side = 10 + WIDTH / 2;
  const pushed = pushOutCircle(side + 0.5, 20, 1, rects, 0.75);
  expect(pushed.x).toBeCloseTo(side + 1, 6);
  expect(pushed.z).toBeCloseTo(20, 6);
  const low = pushOutCircle(10, 20 + HALF_D + 0.5, 1, rects, 0.75);
  expect(low.hits).toHaveLength(0);
  expect(low.x).toBeCloseTo(10, 6);
  expect(low.z).toBeCloseTo(20 + HALF_D + 0.5, 6);
});

test('the side of a ramp is a wall partway up and holds the mech inside its width', () => {
  const rects = mapBlockers(mapOf([ramp()]));
  const side = 10 + WIDTH / 2;
  const over = HEIGHT / 2 + 0.75; // feet 3 m up the slope, plus the step
  const outside = pushOutCircle(side + 0.5, 20, 1, rects, over);
  expect(outside.x).toBeCloseTo(side + 1, 6);
  // on the slope: the middle may come no nearer the side than the hit radius
  const held = pushOutCircle(side - 0.5, 20, 1, rects, over);
  expect(held.x).toBeCloseTo(side - 1, 6);
  expect(held.z).toBeCloseTo(20, 6);
});

test('the ramp climbs 6 m over 18 m, under the 20 degree walk limit', () => {
  const slope = (Math.atan2(HEIGHT, LENGTH) * 180) / Math.PI;
  expect(slope).toBeCloseTo(18.43, 2);
  expect(slope).toBeLessThanOrEqual(RAMP_TUNE.maxSlopeDeg);
  expect(RAMP_TUNE.maxSlopeDeg).toBe(20);
});

test('a ramp is a stack of shot boxes that follows its surface', () => {
  const rects = mapBlockers(mapOf([ramp()]));
  const boxes = rects.flatMap(rectBoxes);
  // a shot 1 m up, aimed along the slope from beyond the low end: one tall box would stop it 1 m out at z = 29,
  // while the surface is 1 m high only at z = 26 (4 m out). The stack stops it between the two.
  const hit = fireRayHit(10, 1, 30, 0, 0, -1, 20, boxes);
  expect(hit).not.toBeNull();
  expect(hit?.dist).toBeGreaterThan(3);
  expect(hit?.dist).toBeLessThanOrEqual(4);
});

test('a sortie makes a ramp a stack of boxes, not one box over the air above it', () => {
  const game = newGame(mapOf([ramp()]));
  expect(game.propBoxes.length).toBeGreaterThan(1);
  expect(PROP_SIZE.ramp).toEqual({ w: WIDTH, h: HEIGHT, d: LENGTH, blocks: true });
});
