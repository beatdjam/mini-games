import { expect, test } from 'vitest';
import { TOUCH_BUTTONS, TOUCH_DEFAULTS } from '../../src/data/touch.ts';

test('the touch defaults cover the five buttons inside the screen', () => {
  const ids = Object.keys(TOUCH_DEFAULTS);
  expect(ids.sort()).toEqual(['boost', 'jump', 'lock', 'main', 'sub']);
  for (const id of TOUCH_BUTTONS) {
    const place = TOUCH_DEFAULTS[id];
    expect(place.x).toBeGreaterThanOrEqual(0);
    expect(place.x).toBeLessThanOrEqual(1);
    expect(place.y).toBeGreaterThanOrEqual(0);
    expect(place.y).toBeLessThanOrEqual(1);
  }
});

test('the touch defaults are the places the player arranged', () => {
  expect(TOUCH_DEFAULTS.main).toMatchObject({ x: 0.83, y: 0.56, s: 1.1 });
  expect(TOUCH_DEFAULTS.sub).toMatchObject({ x: 0.77, y: 0.82, s: 1 });
  expect(TOUCH_DEFAULTS.jump).toMatchObject({ x: 0.87, y: 0.84, s: 1 });
  expect(TOUCH_DEFAULTS.boost).toMatchObject({ x: 0.95, y: 0.57, s: 1 });
  expect(TOUCH_DEFAULTS.lock).toMatchObject({ x: 0.9, y: 0.34, s: 1 });
});
