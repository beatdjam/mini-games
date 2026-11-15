import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el, runSystems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { readTouch } from '../../src/app/touch.ts';
import { pastSkipGuard } from './cutsceneSkip.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(844, 390);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

// Runs the game's systems by hand until `done` holds (the pattern of the other e2e tests: the page's own frame loop may
// be throttled while many test files share the browser), and fails when it never does.
async function until(done: () => boolean, tries = 720): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    runSystems(1 / 60);
    if (i % 30 === 29) await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} steps`);
}

// A tap that skips the cutscene: the first moment after the skip guard, which throws away earlier presses.
async function skipCutscene(): Promise<void> {
  await until(pastSkipGuard);
  document.body.click();
  await until(() => currentGame()?.script.cutscene === null);
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
  await skipCutscene();
  expect(el('#touch').hidden).toBe(false);
});

test('what the fingers held is let go when the layer is hidden', async () => {
  startSortie();
  showTouch();
  // these presses stand for fingers already down as the cutscene starts; they must not read as a tap that skips it (a
  // slow frame can carry the cutscene past its skip guard before they land, and the layer would never be hidden)
  el('#touch').dataset.noskip = '';
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
  await skipCutscene();
  const after = readTouch();
  expect(after.input.boost).toBe(false);
  expect(after.input.fire).toBe(false);
  expect(Math.abs(after.input.moveZ)).toBe(0);
});

test('the red edge of a hit is hidden while the cutscene plays, as the HUD is', async () => {
  startSortie();
  await until(() => currentGame()?.script.cutscene !== null);
  await until(() => el('#sbPlayHurt').hidden);
  await skipCutscene();
  await until(() => !el('#sbPlayHurt').hidden);
});
