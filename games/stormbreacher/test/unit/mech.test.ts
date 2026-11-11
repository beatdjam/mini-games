import { expect, test } from 'vitest';
import { MOVE_TUNE } from '../../src/data/tune.ts';
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

const speed = (m: MechState): number => Math.hypot(m.vx, m.vz);

const count = (events: MechEvent[], kind: MechEvent['kind']): number =>
  events.filter(event => event.kind === kind).length;

test('holding forward reaches walk and never passes it', () => {
  const m = newMech();
  for (let i = 0; i < 120; i++) stepMech(m, input({ moveZ: 1 }), 1 / 60, MOVE_TUNE, 8);
  expect(speed(m)).toBeCloseTo(MOVE_TUNE.walk, 1);
  expect(speed(m)).toBeLessThanOrEqual(MOVE_TUNE.walk + 1e-9);
});

test('diagonal input also stays at walk', () => {
  const m = newMech();
  for (let i = 0; i < 120; i++) stepMech(m, input({ moveX: 1, moveZ: 1 }), 1 / 60, MOVE_TUNE, 8);
  expect(speed(m)).toBeCloseTo(MOVE_TUNE.walk, 1);
  expect(speed(m)).toBeLessThanOrEqual(MOVE_TUNE.walk + 1e-9);
});

test('a jump reaches jump^2 / (2 * gravity) and lands exactly once', () => {
  const m = newMech();
  let maxY = 0;
  let lands = 0;
  const first = stepMech(m, input({ jump: true }), 1 / 60, MOVE_TUNE, 8);
  expect(count(first, 'jump')).toBe(1);
  maxY = Math.max(maxY, m.y);
  for (let i = 0; i < 180; i++) {
    const events = stepMech(m, idle, 1 / 60, MOVE_TUNE, 8);
    lands += count(events, 'land');
    maxY = Math.max(maxY, m.y);
  }
  expect(maxY).toBeCloseTo((MOVE_TUNE.jump * MOVE_TUNE.jump) / (2 * MOVE_TUNE.gravity), 1);
  expect(lands).toBe(1);
});

test('a jump input on one frame does not jump again after the landing', () => {
  // The input says true only on the press frame (the view reads the frame the key goes down), so holding the key
  // leaves it false on the frames after.
  const m = newMech();
  let jumps = 0;
  let lands = 0;
  for (let i = 0; i < 240; i++) {
    const events = stepMech(m, input({ jump: i === 0 }), 1 / 60, MOVE_TUNE, 8);
    jumps += count(events, 'jump');
    lands += count(events, 'land');
  }
  expect(jumps).toBe(1);
  expect(lands).toBe(1);
});

test('holding a jump in the air hovers and lands later than a plain jump', () => {
  const plain = newMech();
  stepMech(plain, input({ jump: true }), 1 / 60, MOVE_TUNE, 8);
  let plainFrames = 1;
  while (!plain.grounded && plainFrames < 600) {
    stepMech(plain, idle, 1 / 60, MOVE_TUNE, 8);
    plainFrames++;
  }

  const hover = newMech();
  stepMech(hover, input({ jump: true, jumpHeld: true }), 1 / 60, MOVE_TUNE, 8);
  let hoverFrames = 1;
  while (!hover.grounded && hoverFrames < 600) {
    stepMech(hover, input({ jumpHeld: true }), 1 / 60, MOVE_TUNE, 8);
    hoverFrames++;
  }

  expect(plain.grounded).toBe(true);
  expect(hover.grounded).toBe(true);
  expect(hoverFrames).toBeGreaterThan(plainFrames);
});

test('a hover never falls faster than hoverFall while the gauge lasts', () => {
  const m = newMech();
  stepMech(m, input({ jump: true, jumpHeld: true }), 1 / 60, MOVE_TUNE, 8);
  let started = false;
  for (let i = 0; i < 600 && !m.grounded; i++) {
    const events = stepMech(m, input({ jumpHeld: true }), 1 / 60, MOVE_TUNE, 8);
    started = started || count(events, 'hoverStart') === 1;
    if (m.gauge > 0) expect(m.vy).toBeGreaterThanOrEqual(-MOVE_TUNE.hoverFall - 1e-9);
  }
  expect(started).toBe(true);
});

test('a hover drains the gauge at hoverDrain', () => {
  const m = newMech();
  stepMech(m, input({ jump: true, jumpHeld: true }), 1 / 60, MOVE_TUNE, 8);
  let started = false;
  for (let i = 0; i < 300 && !started; i++) {
    const events = stepMech(m, input({ jumpHeld: true }), 1 / 60, MOVE_TUNE, 8);
    started = count(events, 'hoverStart') === 1;
  }
  expect(started).toBe(true);
  const before = m.gauge;
  for (let i = 0; i < 30; i++) stepMech(m, input({ jumpHeld: true }), 1 / 60, MOVE_TUNE, 8);
  expect(m.gauge).toBeCloseTo(before - MOVE_TUNE.hoverDrain * 0.5, 2);
});

test('a hover while boosting drains the boost and the hover together', () => {
  const m = newMech();
  stepMech(m, input({ jump: true, jumpHeld: true, boost: true }), 1 / 60, MOVE_TUNE, 8);
  let started = false;
  for (let i = 0; i < 300 && !started; i++) {
    const events = stepMech(m, input({ jumpHeld: true, boost: true }), 1 / 60, MOVE_TUNE, 8);
    started = count(events, 'hoverStart') === 1;
  }
  expect(started).toBe(true);
  const before = m.gauge;
  for (let i = 0; i < 30; i++) stepMech(m, input({ jumpHeld: true, boost: true }), 1 / 60, MOVE_TUNE, 8);
  expect(m.gauge).toBeCloseTo(before - (MOVE_TUNE.boostDrain + MOVE_TUNE.hoverDrain) * 0.5, 2);
});

test('an empty gauge falls normally and ends the hover once', () => {
  const m = newMech();
  stepMech(m, input({ jump: true, jumpHeld: true }), 1 / 60, MOVE_TUNE, 8);
  let started = false;
  for (let i = 0; i < 300 && !started; i++) {
    const events = stepMech(m, input({ jumpHeld: true }), 1 / 60, MOVE_TUNE, 8);
    started = count(events, 'hoverStart') === 1;
  }
  expect(started).toBe(true);
  m.gauge = 0.001; // almost empty, so the hover ends in a few steps
  const events: MechEvent[] = [];
  let fell = false;
  for (let i = 0; i < 300 && !m.grounded; i++) {
    events.push(...stepMech(m, input({ jumpHeld: true }), 1 / 60, MOVE_TUNE, 8));
    if (m.vy < -MOVE_TUNE.hoverFall) fell = true;
  }
  expect(m.grounded).toBe(true);
  expect(fell).toBe(true);
  expect(count(events, 'hoverEnd')).toBe(1);
  expect(count(events, 'land')).toBe(1);
});

test('the gauge does not drain while the mech is still rising', () => {
  const m = newMech();
  stepMech(m, input({ jump: true, jumpHeld: true }), 1 / 60, MOVE_TUNE, 8);
  // The 4 m mech's jump tops out after 17 frames of a 60th of a second.
  for (let i = 0; i < 17; i++) {
    expect(m.vy).toBeGreaterThan(0);
    stepMech(m, input({ jumpHeld: true }), 1 / 60, MOVE_TUNE, 8);
    expect(m.gauge).toBe(1);
  }
});

test('boosting drains the gauge at boostDrain and ends once when it is empty', () => {
  const m = newMech();
  const early: MechEvent[] = [];
  for (let i = 0; i < 60; i++) early.push(...stepMech(m, input({ boost: true }), 1 / 60, MOVE_TUNE, 8));
  expect(m.gauge).toBeCloseTo(1 - MOVE_TUNE.boostDrain, 2);
  expect(speed(m)).toBeGreaterThan(MOVE_TUNE.walk);
  expect(count(early, 'boostStart')).toBe(1);

  const rest: MechEvent[] = [];
  for (let i = 0; i < 240; i++) rest.push(...stepMech(m, input({ boost: true }), 1 / 60, MOVE_TUNE, 8));
  expect(m.gauge).toBe(0);
  expect(count(rest, 'boostEnd')).toBe(1);
  expect(speed(m)).toBeLessThanOrEqual(MOVE_TUNE.walk + 1e-9);
});

test('one dt of 0.2 and ten of 0.02 end in almost the same place', () => {
  const one = newMech();
  stepMech(one, input({ moveZ: 1, jump: true }), 0.2, MOVE_TUNE, 8);
  const many = newMech();
  for (let i = 0; i < 10; i++) stepMech(many, input({ moveZ: 1, jump: i === 0 }), 0.02, MOVE_TUNE, 8);
  expect(Math.hypot(one.x - many.x, one.y - many.y, one.z - many.z)).toBeLessThanOrEqual(0.05);
});

test('holding fire at 8 a second makes about 8 shots in a second', () => {
  const m = newMech();
  const events: MechEvent[] = [];
  for (let i = 0; i < 60; i++) events.push(...stepMech(m, input({ fire: true }), 1 / 60, MOVE_TUNE, 8));
  expect(count(events, 'fire')).toBeGreaterThanOrEqual(7);
  expect(count(events, 'fire')).toBeLessThanOrEqual(9);
});
