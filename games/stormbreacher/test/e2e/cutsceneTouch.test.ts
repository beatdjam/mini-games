import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { readTouch } from '../../src/app/touch.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(844, 390);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

async function until(done: () => boolean, tries = 240): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} frames`);
}

// The test browser is not a touch device, so the sortie leaves the layer hidden; it is shown as a phone has it.
const showTouch = (): void => {
  el('#touch').hidden = false;
};

const press = (target: HTMLElement, type: string, id: number, x: number, y: number): boolean =>
  target.dispatchEvent(
    new PointerEvent(type, { pointerId: id, pointerType: 'touch', bubbles: true, clientX: x, clientY: y }),
  );

test('the touch layer is hidden while the cutscene plays and comes back when it ends', async () => {
  startSortie();
  showTouch();
  await until(() => currentGame()?.script.cutscene !== null);
  await until(() => el('#touch').hidden);
  // a tap on the screen still skips it, with the layer hidden
  document.body.click();
  await until(() => currentGame()?.script.cutscene === null);
  expect(el('#touch').hidden).toBe(false);
});

test('what the fingers held is let go when the layer is hidden', async () => {
  startSortie();
  showTouch();
  // the stick, the boost and the main shot are down as the cutscene starts
  press(el('#touch'), 'pointerdown', 41, 100, 200);
  press(el('#touch'), 'pointermove', 41, 100, 150);
  press(el('#btnBoost'), 'pointerdown', 42, 700, 300);
  press(el('#btnFire'), 'pointerdown', 43, 760, 250);
  await until(() => el('#touch').hidden);
  const held = readTouch();
  expect(held.input.boost).toBe(false);
  expect(held.input.fire).toBe(false);
  expect(held.input.moveX).toBe(0);
  expect(Math.abs(held.input.moveZ)).toBe(0);
  document.body.click();
  await until(() => currentGame()?.script.cutscene === null);
  const after = readTouch();
  expect(after.input.boost).toBe(false);
  expect(after.input.fire).toBe(false);
  expect(Math.abs(after.input.moveZ)).toBe(0);
});
