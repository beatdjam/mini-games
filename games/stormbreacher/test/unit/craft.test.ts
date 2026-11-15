import { expect, test } from 'vitest';
import { CRAFT_TUNE, craftSideX, craftZ } from '../../src/data/craft.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { RAMP_TUNE } from '../../src/data/props.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { surfaceAt } from '../../src/logic/collide.ts';
import { allyCraftRects, craftBack, craftRects, inCraftLane } from '../../src/logic/craft.ts';
import { cameraBlockers, mapBlockers } from '../../src/logic/mapShapes.ts';

const bounds = M1B_HAND.bounds;
const rects = craftRects(bounds);
const [deck, leftWall, rightWall, stern, wheelhouse, ramp] = rects;
const z0 = craftZ(bounds);

test('the craft has the deck, the two side walls, the stern, the wheelhouse and the ramp', () => {
  expect(rects).toHaveLength(6);
  expect(deck.top).toBe(CRAFT_TUNE.deckTop);
  expect(leftWall.top).toBe(CRAFT_TUNE.hullTop + CRAFT_TUNE.wallHeight);
  expect(rightWall.top).toBe(CRAFT_TUNE.hullTop + CRAFT_TUNE.wallHeight);
  expect(stern.top).toBe(CRAFT_TUNE.hullTop + CRAFT_TUNE.wallHeight + CRAFT_TUNE.sternHeightExtra);
  expect(wheelhouse.top).toBe(CRAFT_TUNE.hullTop + CRAFT_TUNE.wheelhouse.h);
  expect(ramp.ramp).toBe(true);
  // the drawn sizes (view/shore.ts): the walls stand at x +-3.25 and the deck's top is 1.8 m
  expect(leftWall.x).toBeCloseTo(-3.25, 6);
  expect(rightWall.x).toBeCloseTo(3.25, 6);
  expect(stern.z).toBeCloseTo(z0 + CRAFT_TUNE.length - CRAFT_TUNE.wallThickness / 2, 6);
  expect(wheelhouse.z).toBeCloseTo(z0 + CRAFT_TUNE.length - CRAFT_TUNE.wheelhouse.fromStern, 6);
});

test('the ramp climbs from the sand at its tip to the hinge at the hull top', () => {
  const run = CRAFT_TUNE.rampLength * Math.cos(CRAFT_TUNE.rampTilt);
  expect(surfaceAt(ramp, 0, z0)).toBeCloseTo(CRAFT_TUNE.hullTop, 6);
  expect(surfaceAt(ramp, 0, z0 - run)).toBeCloseTo(0, 6);
  // the slope the mech must climb is no steeper than a ramp may be
  const slope = (Math.atan2(CRAFT_TUNE.hullTop, run) * 180) / Math.PI;
  expect(slope).toBeLessThanOrEqual(RAMP_TUNE.maxSlopeDeg);
});

test('the craft’s back end and the lane the mech may pass the front edge in', () => {
  expect(craftBack(bounds)).toBe(187);
  const lane = CRAFT_TUNE.width / 2 - MECH_TUNE.radius;
  expect(inCraftLane(0, bounds)).toBe(true);
  expect(inCraftLane(lane, bounds)).toBe(true);
  expect(inCraftLane(-lane, bounds)).toBe(true);
  expect(inCraftLane(lane + 0.1, bounds)).toBe(false);
  expect(inCraftLane(-lane - 0.1, bounds)).toBe(false);
});

test('the allies’ two crafts stand beside the player’s with the same boxes', () => {
  const beside = allyCraftRects(bounds);
  expect(beside).toHaveLength(12); // six boxes each
  const decks = beside.filter(rect => rect.top === CRAFT_TUNE.deckTop);
  expect(decks.map(rect => rect.x).sort((a, b) => a - b)).toEqual([-12, 12]);
  for (const deck of decks) {
    expect(deck.z).toBeCloseTo(z0 + CRAFT_TUNE.length / 2, 6);
    expect(deck.halfW).toBeCloseTo(CRAFT_TUNE.deckWidth / 2, 6);
  }
  // the allies' ramps reach the sand like the player's
  const ramps = beside.filter(rect => rect.ramp === true);
  expect(ramps).toHaveLength(2);
  const run = CRAFT_TUNE.rampLength * Math.cos(CRAFT_TUNE.rampTilt);
  for (const ramp of ramps) expect(surfaceAt(ramp, ramp.x, z0 - run)).toBeCloseTo(0, 5);
});

test('the camera keeps out of the map and all three landing craft', () => {
  const blockers = cameraBlockers(M1B_HAND);
  // the map's shapes come first, so the props' places in cameraBoxes still line up with blockingPropIndexes
  expect(blockers.slice(0, mapBlockers(M1B_HAND).length)).toEqual(mapBlockers(M1B_HAND));
  for (const rect of allyCraftRects(bounds)) expect(blockers).toContainEqual(rect);
  for (const rect of craftRects(bounds)) expect(blockers).toContainEqual(rect);
});

test('the three hulls stand a gap apart and do not touch', () => {
  const middle = (bounds.minX + bounds.maxX) / 2;
  const hulls = [craftSideX(bounds, -1), middle, craftSideX(bounds, 1)].sort((a, b) => a - b);
  for (let i = 1; i < hulls.length; i++) {
    const gap = hulls[i] - hulls[i - 1] - CRAFT_TUNE.width;
    expect(gap, `the hulls at ${hulls[i - 1]} and ${hulls[i]}`).toBeGreaterThanOrEqual(CRAFT_TUNE.width / 2);
    expect(gap, `the hulls at ${hulls[i - 1]} and ${hulls[i]}`).toBeLessThanOrEqual(CRAFT_TUNE.width);
  }
});
