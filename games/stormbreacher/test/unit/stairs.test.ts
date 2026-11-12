// The low wall and the stairs: the stairs turn into one rect per step, each a rise higher than the last and facing the
// way the prop is turned, and the low wall is higher than a step but lower than a jump's peak.
import { expect, test } from 'vitest';
import { PROP_SIZE, STAIRS_TUNE, STAIR_RISE } from '../../src/data/props.ts';
import { MOVE_TUNE } from '../../src/data/tune.ts';
import type { MapDef, Prop } from '../../src/data/types.ts';
import { blockingPropIndexes, mapBlockers } from '../../src/logic/mapShapes.ts';

function mapOf(props: Prop[]): MapDef {
  return { id: 'stairs-test', bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, props, targets: [], spawns: {} };
}

const stairs = (over: Partial<Prop> = {}): Prop => ({ kind: 'stairs', x: 10, z: 20, yaw: 0, scale: 1, ...over });

test('a flight of stairs is one rect per step', () => {
  const map = mapOf([stairs()]);
  expect(mapBlockers(map)).toHaveLength(STAIRS_TUNE.steps);
  expect(blockingPropIndexes(map)).toEqual(Array(STAIRS_TUNE.steps).fill(0));
});

test('each step tops a rise above the one before, up to the seawall’s height', () => {
  const rects = mapBlockers(mapOf([stairs()]));
  rects.forEach((rect, i) => expect(rect.top).toBeCloseTo(STAIR_RISE * (i + 1), 9));
  expect(rects[rects.length - 1].top).toBeCloseTo(PROP_SIZE.seawall.h, 9);
  expect(STAIR_RISE).toBeLessThanOrEqual(MOVE_TUNE.stepHeight);
});

test('the steps together cover the prop’s width and depth, the lowest on the +z side', () => {
  const rects = mapBlockers(mapOf([stairs()]));
  for (const rect of rects) {
    expect(rect.x).toBe(10);
    expect(rect.halfW).toBe(PROP_SIZE.stairs.w / 2);
  }
  expect(rects[0].z + rects[0].halfD).toBeCloseTo(20 + PROP_SIZE.stairs.d / 2, 9);
  expect(rects[rects.length - 1].z - rects[rects.length - 1].halfD).toBeCloseTo(20 - PROP_SIZE.stairs.d / 2, 9);
  expect(rects[0].z).toBeGreaterThan(rects[1].z);
});

test('turning the stairs a quarter turn climbs towards -x', () => {
  const rects = mapBlockers(mapOf([stairs({ yaw: Math.PI / 2 })]));
  expect(rects[0].x).toBeGreaterThan(rects[1].x);
  for (const rect of rects) expect(rect.z).toBeCloseTo(20, 9);
  expect(rects[0].yaw).toBe(Math.PI / 2);
});

test('the low wall is higher than a step and lower than a jump’s peak', () => {
  expect(PROP_SIZE.lowWall.h).toBeGreaterThan(MOVE_TUNE.stepHeight);
  const peak = MOVE_TUNE.jump ** 2 / (2 * MOVE_TUNE.gravity);
  expect(PROP_SIZE.lowWall.h).toBeLessThan(peak);
});
