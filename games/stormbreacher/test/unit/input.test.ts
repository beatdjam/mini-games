import { expect, test } from 'vitest';
import { cursorAimInput, mergeInput, STICK_MOVE_MIN } from '../../src/logic/input.ts';
import type { MechInput } from '../../src/logic/mech.ts';

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

test('a pushed stick moves the mech, even with the move keys held', () => {
  const merged = mergeInput(input({ moveX: 0.3, moveZ: 0.8 }), input({ moveX: -1, moveZ: 1 }));
  expect(merged.moveX).toBe(0.3);
  expect(merged.moveZ).toBe(0.8);
});

test('a stick at rest leaves the move keys to move the mech', () => {
  const merged = mergeInput(input({ moveX: 0.01, moveZ: 0.01 }), input({ moveX: -1, moveZ: 1 }));
  expect(merged.moveX).toBe(-1);
  expect(merged.moveZ).toBe(1);
});

test('the touch aim shares the stick threshold that hands movement to the keys', () => {
  // exactly at the threshold the stick does not steer, so the touch aim holds the yaw instead of facing the stick
  expect(mergeInput(input({ moveX: STICK_MOVE_MIN }), input({ moveX: -1 })).moveX).toBe(-1);
  expect(mergeInput(input({ moveX: STICK_MOVE_MIN + 0.001 }), input({ moveX: -1 })).moveX).toBe(STICK_MOVE_MIN + 0.001);
});

test('the turn of both sides adds', () => {
  const merged = mergeInput(input({ turn: 0.2 }), input({ turn: -0.05 }));
  expect(merged.turn).toBeCloseTo(0.15, 10);
});

test('the fire is on when either side fires', () => {
  expect(mergeInput(input({ fire: true }), idle).fire).toBe(true);
  expect(mergeInput(idle, input({ fire: true })).fire).toBe(true);
  expect(mergeInput(idle, idle).fire).toBe(false);
});

test('a jump on either side never comes out of the merge (D-50)', () => {
  const jumping = input({ jump: true, jumpHeld: true });
  for (const merged of [mergeInput(jumping, idle), mergeInput(idle, jumping)]) {
    expect(merged.jump).toBe(false);
    expect(merged.jumpHeld).toBe(false);
  }
});

test('the cursor aims at its point and holds the yaw without one', () => {
  const at = { x: 3, z: -4 };
  expect(cursorAimInput(at, 1.2)).toEqual({ aimAt: at });
  expect(cursorAimInput(null, 1.2)).toEqual({ face: 1.2 });
});
