import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el } from '@engine/core/index.ts';
import { INPUT } from '@engine/ui/index.ts';
import { TOUCH_BUTTONS, TOUCH_DEFAULTS } from '../../src/data/touch.ts';
import { LOOK_RECENT, initTouch, lookInUse, readTouch } from '../../src/app/touch.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// the phone is held sideways (landscape) when the touch screen is used
beforeAll(async () => {
  await page.viewport(844, 390);
  initTouch();
});

const pointer = (type: string, id: number, x: number, y: number): PointerEvent =>
  new PointerEvent(type, {
    pointerId: id,
    pointerType: 'touch',
    bubbles: true,
    clientX: x,
    clientY: y,
  });

test('the touch screen is shown with the six buttons at their default places', () => {
  expect(el('#touch').hidden).toBe(false);
  for (const id of TOUCH_BUTTONS) {
    const box = el(`[data-lb="${id}"]`).getBoundingClientRect();
    const place = TOUCH_DEFAULTS[id];
    expect(Math.abs(box.left + box.width / 2 - innerWidth * place.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.top + box.height / 2 - innerHeight * place.y)).toBeLessThanOrEqual(2);
  }
});

test('the boost button holds while its finger stays down', () => {
  const button = el('#btnBoost');
  button.dispatchEvent(pointer('pointerdown', 31, 10, 10));
  expect(readTouch().input.boost).toBe(true);
  button.dispatchEvent(pointer('pointerup', 31, 10, 10));
  expect(readTouch().input.boost).toBe(false);
});

test('the use button holds while its finger stays down', () => {
  const button = el('#btnUse');
  button.dispatchEvent(pointer('pointerdown', 33, 10, 10));
  expect(readTouch().use).toBe(true);
  expect(readTouch().use).toBe(true);
  button.dispatchEvent(pointer('pointerup', 33, 10, 10));
  expect(readTouch().use).toBe(false);
});

test('releaseTouch lets go of a held melee button and its pressed mark', async () => {
  const { releaseTouch } = await import('../../src/app/touch.ts');
  const button = el('#btnMelee');
  button.dispatchEvent(pointer('pointerdown', 36, 10, 10));
  expect(readTouch().melee).toBe(true);
  releaseTouch();
  expect(readTouch().melee).toBe(false);
  expect(button.classList.contains('down')).toBe(false);
});

test('clearPendingTouch lets go of a held melee button and its pressed mark', async () => {
  const { clearPendingTouch } = await import('../../src/app/touch.ts');
  const button = el('#btnMelee');
  button.dispatchEvent(pointer('pointerdown', 37, 10, 10));
  expect(readTouch().melee).toBe(true);
  clearPendingTouch();
  expect(readTouch().melee).toBe(false);
  expect(button.classList.contains('down')).toBe(false);
  button.dispatchEvent(pointer('pointerup', 37, 10, 10));
});

test('the melee button holds while its finger stays down', () => {
  const button = el('#btnMelee');
  button.dispatchEvent(pointer('pointerdown', 35, 10, 10));
  expect(readTouch().melee).toBe(true);
  expect(readTouch().melee).toBe(true);
  button.dispatchEvent(pointer('pointerup', 35, 10, 10));
  expect(readTouch().melee).toBe(false);
});

test('the use button does not sit on top of the other buttons', () => {
  const box = (id: string): DOMRect => el(`[data-lb="${id}"]`).getBoundingClientRect();
  const use = box('use');
  for (const id of TOUCH_BUTTONS) {
    if (id === 'use') continue;
    const other = box(id);
    const apart =
      use.right <= other.left || other.right <= use.left || use.bottom <= other.top || other.bottom <= use.top;
    expect(apart, `use overlaps ${id}`).toBe(true);
  }
});

test('the melee button does not sit on top of the main and sub buttons', () => {
  const box = (id: string): DOMRect => el(`[data-lb="${id}"]`).getBoundingClientRect();
  const melee = box('melee');
  for (const id of ['main', 'sub']) {
    const other = box(id);
    const apart =
      melee.right <= other.left || other.right <= melee.left || melee.bottom <= other.top || other.bottom <= melee.top;
    expect(apart, `melee overlaps ${id}`).toBe(true);
  }
});

test('a jump is true for one read only', () => {
  const button = el('#btnJump');
  button.dispatchEvent(pointer('pointerdown', 32, 10, 10));
  expect(readTouch().input.jump).toBe(true);
  expect(readTouch().input.jump).toBe(false);
  button.dispatchEvent(pointer('pointerup', 32, 10, 10));
});

test('the jump button holds while its finger stays down', () => {
  const button = el('#btnJump');
  button.dispatchEvent(pointer('pointerdown', 34, 10, 10));
  expect(readTouch().input.jumpHeld).toBe(true);
  expect(readTouch().input.jumpHeld).toBe(true);
  expect(readTouch().input.jump).toBe(false);
  button.dispatchEvent(pointer('pointerup', 34, 10, 10));
  expect(readTouch().input.jumpHeld).toBe(false);
});

test('the view counts as in use for LOOK_RECENT after a drag', () => {
  INPUT.look(0.01, 0);
  const t = performance.now();
  expect(lookInUse(t)).toBe(true);
  expect(lookInUse(t + LOOK_RECENT * 1000 + 5)).toBe(false);
});

test('the right drag reports its move from where the finger went down, and the stick does not', () => {
  const touch = el('#touch');
  touch.dispatchEvent(pointer('pointerdown', 41, 600, 150));
  expect(readTouch().drag).toEqual({ x: 0, y: 0 });
  touch.dispatchEvent(pointer('pointermove', 41, 640, 190));
  expect(readTouch().drag).toEqual({ x: 40, y: 40 });
  touch.dispatchEvent(pointer('pointerup', 41, 640, 190));
  expect(readTouch().drag).toBeNull();

  touch.dispatchEvent(pointer('pointerdown', 42, 100, 150));
  expect(readTouch().drag).toBeNull();
  touch.dispatchEvent(pointer('pointermove', 42, 140, 190));
  expect(readTouch().drag).toBeNull();
  touch.dispatchEvent(pointer('pointerup', 42, 140, 190));
});

test('the view drag still turns the dev views’ view', () => {
  const touch = el('#touch');
  touch.dispatchEvent(pointer('pointerdown', 43, 600, 150));
  touch.dispatchEvent(pointer('pointermove', 43, 650, 150));
  expect(readTouch().input.turn).not.toBe(0);
  touch.dispatchEvent(pointer('pointerup', 43, 650, 150));
});
