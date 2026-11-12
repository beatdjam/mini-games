import { expect, test } from 'vitest';
import { MOVE_TUNE } from '../../src/data/tune.ts';
import { groundAt, pushOutCircle, rectDistance, rectGap, type GroundRect } from '../../src/logic/collide.ts';
import { newMech, stepMech, type MechEvent, type MechInput, type MechState } from '../../src/logic/mech.ts';

const idle: MechInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
};

const input = (over: Partial<MechInput>): MechInput => ({ ...idle, ...over });

const square: GroundRect = { x: 0, z: 0, halfW: 2, halfD: 2, yaw: 0 };

test('a circle near a rect side moves out to the radius', () => {
  const pushed = pushOutCircle(0, 2.5, 1, [square]);
  expect(pushed.x).toBeCloseTo(0, 6);
  expect(pushed.z).toBeCloseTo(3, 6);
  expect(pushed.hits.length).toBe(1);
  expect(pushed.hits[0].nx).toBeCloseTo(0, 6);
  expect(pushed.hits[0].nz).toBeCloseTo(1, 6);
});

test('a circle near a corner is pushed out along the diagonal', () => {
  const pushed = pushOutCircle(2.5, 2.5, 1, [square]);
  expect(pushed.x).toBeCloseTo(2 + 1 / Math.sqrt(2), 6);
  expect(pushed.z).toBeCloseTo(2 + 1 / Math.sqrt(2), 6);
});

test('a circle whose middle is inside leaves through the shallower face', () => {
  const pushed = pushOutCircle(0.5, 0, 1, [square]);
  expect(pushed.x).toBeCloseTo(3, 6);
  expect(pushed.z).toBeCloseTo(0, 6);
});

test('a turned rect pushes along its own axes', () => {
  const rect: GroundRect = { x: 0, z: 0, halfW: 3, halfD: 1, yaw: Math.PI / 2 };
  const pushed = pushOutCircle(1.5, 0, 1, [rect]);
  expect(pushed.x).toBeCloseTo(2, 6);
  expect(pushed.z).toBeCloseTo(0, 6);
  expect(rectDistance(rect, pushed.x, pushed.z)).toBeCloseTo(1, 6);
});

test('a circle in the inside corner of an L leaves both rects, in either order', () => {
  const a: GroundRect = { x: 0, z: 0, halfW: 5, halfD: 1, yaw: 0 };
  const b: GroundRect = { x: 4, z: 4, halfW: 1, halfD: 5, yaw: 0 };
  for (const rects of [
    [a, b],
    [b, a],
  ]) {
    const pushed = pushOutCircle(2.5, 1.5, 1, rects);
    expect(pushed.x).toBeCloseTo(2, 6);
    expect(pushed.z).toBeCloseTo(2, 6);
  }
});

test('with no rects the circle does not move', () => {
  const pushed = pushOutCircle(3, 4, 1, []);
  expect(pushed.x).toBe(3);
  expect(pushed.z).toBe(4);
  expect(pushed.hits).toEqual([]);
});

test('a rect that is too far away adds no hit', () => {
  const rect: GroundRect = { x: 0, z: 0, halfW: 1, halfD: 1, yaw: 0 };
  const pushed = pushOutCircle(10, 10, 1, [rect]);
  expect(pushed.x).toBe(10);
  expect(pushed.z).toBe(10);
  expect(pushed.hits).toEqual([]);
});

test('groundAt finds the highest top the circle stands over', () => {
  const low: GroundRect = { x: 0, z: 0, halfW: 2, halfD: 2, yaw: 0, top: 0.5 };
  const high: GroundRect = { x: 1, z: 0, halfW: 2, halfD: 2, yaw: 0, top: 1 };
  expect(groundAt(0.5, 0, 1, [low, high], 2)).toBe(1);
  expect(groundAt(0.5, 0, 1, [low, high], 0.8)).toBe(0.5);
  expect(groundAt(10, 10, 1, [low, high], 2)).toBe(0);
});

test('pushOutCircle leaves a rect whose top is under the given height', () => {
  const low: GroundRect = { x: 0, z: 0, halfW: 2, halfD: 2, yaw: 0, top: 0.5 };
  const kept = pushOutCircle(0.5, 0, 1, [low], 0.75);
  expect(kept.x).toBeCloseTo(0.5, 6);
  expect(kept.z).toBeCloseTo(0, 6);
  expect(kept.hits).toEqual([]);
  const pushed = pushOutCircle(0.5, 0, 1, [low]);
  expect(pushed.x).toBeCloseTo(3, 6);
  expect(pushed.hits.length).toBe(1);
});

test('the mech stops at a wall hit head-on and does not enter it', () => {
  const rect: GroundRect = { x: 0, z: -5, halfW: 5, halfD: 0.5, yaw: 0 };
  const world = { rects: [rect], radius: 1 };
  const m = newMech();
  for (let i = 0; i < 120; i++) {
    stepMech(m, input({ moveZ: 1 }), 1 / 60, MOVE_TUNE, 0, world);
    expect(rectDistance(rect, m.x, m.z)).toBeGreaterThanOrEqual(1 - 1e-6);
  }
  expect(m.z).toBeCloseTo(-3.5, 6);
  expect(m.x).toBeCloseTo(0, 6);
});

// Walks the mech into the square from the front right for 2 s and returns what happened.
function runSlide(): { mech: MechState; events: MechEvent[]; frames: { x: number; z: number }[] } {
  const rect: GroundRect = { x: 0, z: 0, halfW: 2, halfD: 2, yaw: 0 };
  const world = { rects: [rect], radius: 1 };
  const m = newMech();
  m.x = -1;
  m.z = 4;
  m.yaw = 0;
  const events: MechEvent[] = [];
  const frames: { x: number; z: number }[] = [];
  for (let i = 0; i < 120; i++) {
    events.push(...stepMech(m, input({ moveX: 1, moveZ: 1 }), 1 / 60, MOVE_TUNE, 0, world));
    expect(rectDistance(rect, m.x, m.z)).toBeGreaterThanOrEqual(1 - 1e-6);
    frames.push({ x: m.x, z: m.z });
  }
  return { mech: m, events, frames };
}

test('a glancing hit slides along the wall', () => {
  const { mech, frames } = runSlide();
  const touched = frames.some(frame => frame.x >= -2 && frame.x <= 2 && frame.z < 3.01);
  expect(touched).toBe(true);
  expect(mech.x).toBeGreaterThan(2);
});

test('a long frame still cannot pass a thin wall at boost speed', () => {
  const rect: GroundRect = { x: 0, z: -5, halfW: 5, halfD: 0.1, yaw: 0 };
  const world = { rects: [rect], radius: 1 };
  const m = newMech();
  for (let i = 0; i < 8; i++) {
    stepMech(m, input({ boost: true }), 0.25, MOVE_TUNE, 0, world);
    expect(m.z).toBeGreaterThanOrEqual(-5 + 0.1 + 1 - 1e-6);
  }
  // without the world the mech runs through the wall
  const free = newMech();
  for (let i = 0; i < 8; i++) stepMech(free, input({ boost: true }), 0.25, MOVE_TUNE, 0);
  expect(free.z).toBeLessThan(-5);
  // with one long step per frame the wall is missed, which proves the splitting is what stops it
  const unbroken = newMech();
  const longTune = { ...MOVE_TUNE, maxStep: 0.25 };
  for (let i = 0; i < 8; i++) stepMech(unbroken, input({ boost: true }), 0.25, longTune, 0, world);
  expect(unbroken.z).toBeLessThan(-5);
});

test('the same input gives the same result', () => {
  const first = runSlide();
  const second = runSlide();
  expect(second.mech).toEqual(first.mech);
  expect(second.events).toEqual(first.events);
});

test('rectGap is the distance between two rects, turned or not', () => {
  const square = (x: number, yaw: number): GroundRect => ({ x, z: 0, halfW: 1.5, halfD: 1.5, yaw });
  expect(rectGap(square(0, 0), square(5, 0))).toBeCloseTo(2, 6);
  expect(rectGap(square(0, 0), square(5, Math.PI / 4))).toBeCloseTo(5 - 1.5 - 1.5 * Math.SQRT2, 6);
  expect(rectGap(square(0, 0), square(2, 0.3))).toBe(0);
});
