import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { KEY_TUNE } from '../../src/data/keys.ts';
import { initPlayInput, readInput } from '../../src/app/input.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  initPlayInput();
});

const key = (type: string, code: string, repeat = false): KeyboardEvent =>
  new KeyboardEvent(type, { code, repeat, bubbles: true });

test('W moves the mech forward until it is let go', () => {
  window.dispatchEvent(key('keydown', 'KeyW'));
  expect(readInput(1 / 60).input.moveZ).toBe(1);
  window.dispatchEvent(key('keyup', 'KeyW'));
  expect(readInput(1 / 60).input.moveZ).toBe(0);
});

test('a jump is true for one read and held while Space stays down', () => {
  window.dispatchEvent(key('keydown', 'Space'));
  const first = readInput(1 / 60);
  expect(first.input.jump).toBe(true);
  expect(first.input.jumpHeld).toBe(true);
  const second = readInput(1 / 60);
  expect(second.input.jump).toBe(false);
  expect(second.input.jumpHeld).toBe(true);
  window.dispatchEvent(key('keyup', 'Space'));
  expect(readInput(1 / 60).input.jumpHeld).toBe(false);
});

test('Shift boosts while held', () => {
  window.dispatchEvent(key('keydown', 'ShiftLeft'));
  expect(readInput(1 / 60).input.boost).toBe(true);
  window.dispatchEvent(key('keyup', 'ShiftLeft'));
  expect(readInput(1 / 60).input.boost).toBe(false);
});

test('J fires while held', () => {
  window.dispatchEvent(key('keydown', 'KeyJ'));
  expect(readInput(1 / 60).input.fire).toBe(true);
  window.dispatchEvent(key('keyup', 'KeyJ'));
  expect(readInput(1 / 60).input.fire).toBe(false);
});

test('the left arrow turns by its rate for the frame time', () => {
  window.dispatchEvent(key('keydown', 'ArrowLeft'));
  expect(readInput(0.5).input.turn).toBeCloseTo(KEY_TUNE.lookRate * 0.5, 5);
  window.dispatchEvent(key('keyup', 'ArrowLeft'));
});

test("a held key's repeat does not count as a new jump", () => {
  window.dispatchEvent(key('keydown', 'Space', true));
  expect(readInput(1 / 60).input.jump).toBe(false);
  window.dispatchEvent(key('keyup', 'Space'));
});
