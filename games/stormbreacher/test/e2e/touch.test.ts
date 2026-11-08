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

test('the touch screen is shown with the five buttons at their default places', () => {
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
