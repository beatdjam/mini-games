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
