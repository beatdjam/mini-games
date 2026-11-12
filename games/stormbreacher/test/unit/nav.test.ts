import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { pushOutCircle, rectDistance, type GroundRect } from '../../src/logic/collide.ts';
import { mapBlockers } from '../../src/logic/mapShapes.ts';
import {
  NAV_REBUILD_GAP,
  buildNavField,
  buildNavGrid,
  navTarget,
  newNav,
  stepNav,
  type NavField,
} from '../../src/logic/nav.ts';

const BOUNDS = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
const RADIUS = 0.75;
const FIELD_BUDGET_MS = 10; // the field's rebuild is about 0.3 ms; the limit leaves room for a slow machine

// A wall across the map at z 0 with one gap, x 10..20.
const wallWithGap = (): GroundRect[] => [
  { x: -25, z: 0, halfW: 35, halfD: 1, yaw: 0, top: 4 },
  { x: 40, z: 0, halfW: 20, halfD: 1, yaw: 0, top: 4 },
];

// Walks from (x, z) along navTarget in 1 m steps, pushed out of the walls as an enemy is; the points it passes.
function walkTo(
  field: NavField,
  rects: readonly GroundRect[],
  from: { x: number; z: number },
  to: { x: number; z: number },
) {
  const path = [{ ...from }];
  let { x, z } = from;
  for (let i = 0; i < 400 && Math.hypot(to.x - x, to.z - z) > 1.5; i++) {
    const target = navTarget(field, x, z, to.x, to.z) ?? to;
    const len = Math.hypot(target.x - x, target.z - z);
    const go = Math.min(1, len);
    const moved = pushOutCircle(x + ((target.x - x) / len) * go, z + ((target.z - z) / len) * go, RADIUS, rects);
    x = moved.x;
    z = moved.z;
    path.push({ x, z });
  }
  return path;
}

test('a cell within the enemy’s reach of a wall is blocked, and one beyond it is free', () => {
  const rect: GroundRect = { x: 0, z: 0, halfW: 5, halfD: 1, yaw: 0, top: 3 };
  const grid = buildNavGrid([rect], BOUNDS, RADIUS);
  const blockedAt = (x: number, z: number): number =>
    grid.blocked[Math.floor((z - BOUNDS.minZ) / 2) * grid.cols + Math.floor((x - BOUNDS.minX) / 2)];
  expect(blockedAt(0, 0)).toBe(1);
  expect(blockedAt(4, 0)).toBe(1);
  expect(blockedAt(6, 0)).toBe(0); // the cell's middle (7, 1) is 2 m from the rect: the radius and margin make 1 m
  expect(blockedAt(0, 6)).toBe(0);
  expect(blockedAt(-30, -30)).toBe(0);
});

test('from beyond a wall the way goes through the gap, and a walk along it comes out on the far side', () => {
  const rects = wallWithGap();
  const field = buildNavField(buildNavGrid(rects, BOUNDS, RADIUS), 0, 30);
  // the first point already leans toward the gap (x 10..20), not straight at the mech
  const first = navTarget(field, 0, -20, 0, 30);
  expect(first).not.toBeNull();
  expect(first?.x).toBeGreaterThan(2);
  const path = walkTo(field, rects, { x: 0, z: -20 }, { x: 0, z: 30 });
  const last = path[path.length - 1];
  expect(Math.hypot(last.x - 0, last.z - 30)).toBeLessThan(2);
  // it crossed the wall's line inside the gap, and never stood in a wall
  const crossing = path.find(point => point.z >= 0);
  expect(crossing?.x).toBeGreaterThan(10);
  expect(crossing?.x).toBeLessThan(20);
  for (const point of path)
    for (const rect of rects) expect(rectDistance(rect, point.x, point.z)).toBeGreaterThanOrEqual(RADIUS - 1e-6);
});

test('where no cell is blocked the target is the mech itself', () => {
  const field = buildNavField(buildNavGrid([], BOUNDS, RADIUS), 10, 20);
  expect(navTarget(field, -30, -30, 10, 20)).toEqual({ x: 10, z: 20 });
  // a wall that is out of the way changes nothing
  const side = buildNavField(
    buildNavGrid([{ x: 50, z: 50, halfW: 3, halfD: 1, yaw: 0, top: 3 }], BOUNDS, RADIUS),
    10,
    20,
  );
  expect(navTarget(side, -30, -30, 10, 20)).toEqual({ x: 10, z: 20 });
});

test('an enemy shut off from the mech has no way, so it walks straight', () => {
  // the mech stands in a closed pen
  const pen: GroundRect[] = [
    { x: 0, z: -10, halfW: 10, halfD: 1, yaw: 0, top: 3 },
    { x: 0, z: 10, halfW: 10, halfD: 1, yaw: 0, top: 3 },
    { x: -10, z: 0, halfW: 1, halfD: 10, yaw: 0, top: 3 },
    { x: 10, z: 0, halfW: 1, halfD: 10, yaw: 0, top: 3 },
  ];
  const field = buildNavField(buildNavGrid(pen, BOUNDS, RADIUS), 0, 0);
  expect(navTarget(field, 30, 30, 0, 0)).toBeNull();
});

test('a wall that breaks opens the way: the cells are made again from the rects that are left', () => {
  // a wall across the whole map but for a gap at the far edge
  const rects: GroundRect[] = [{ x: -5, z: 0, halfW: 53, halfD: 1, yaw: 0, top: 4 }];
  const nav = newNav();
  const mech = { x: 0, z: 30 };
  const before = stepNav(nav, rects, BOUNDS, RADIUS, mech, 0.016);
  const around = navTarget(before, 0, -20, mech.x, mech.z);
  expect(around?.x).toBeGreaterThan(5);
  rects.splice(0, 1);
  const after = stepNav(nav, rects, BOUNDS, RADIUS, mech, 0.016);
  expect(after).not.toBe(before);
  expect(navTarget(after, 0, -20, mech.x, mech.z)).toEqual(mech);
});

test('the counts are made again when the mech moves to another cell, but not more often than the gap', () => {
  const rects = wallWithGap();
  const nav = newNav();
  const first = stepNav(nav, rects, BOUNDS, RADIUS, { x: 0, z: 30 }, 0.016);
  // the same cell: nothing is made, however long it takes
  expect(stepNav(nav, rects, BOUNDS, RADIUS, { x: 0.5, z: 30.5 }, 5)).toBe(first);
  // another cell after a long wait: made at once
  const second = stepNav(nav, rects, BOUNDS, RADIUS, { x: 6, z: 30 }, 0.016);
  expect(second).not.toBe(first);
  expect(second.mechCell).not.toBe(first.mechCell);
  // the cells are kept: only the counts were made again
  expect(second.grid).toBe(first.grid);
  // another cell too soon after that one: the counts stay; once the gap has passed they are made
  expect(stepNav(nav, rects, BOUNDS, RADIUS, { x: 12, z: 30 }, NAV_REBUILD_GAP / 2)).toBe(second);
  expect(stepNav(nav, rects, BOUNDS, RADIUS, { x: 12, z: 30 }, NAV_REBUILD_GAP)).not.toBe(second);
});

test('making the counts again on the hand map takes a few tenths of a millisecond, within the frame’s budget', () => {
  const rects = mapBlockers(M1B_HAND);
  const grid = buildNavGrid(rects, M1B_HAND.bounds, RADIUS);
  const runs = 100;
  const start = performance.now();
  for (let i = 0; i < runs; i++) buildNavField(grid, (i % 40) - 20, 40);
  const each = (performance.now() - start) / runs;
  console.log(`nav: one rebuild of the counts on the hand map takes ${each.toFixed(2)} ms`);
  expect(each).toBeLessThan(FIELD_BUDGET_MS);
});
