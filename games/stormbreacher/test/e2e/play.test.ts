import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el } from '@engine/core/index.ts';
import { PLAY_TUNE } from '../../src/data/tune.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { state } from '../../src/app/screen.ts';
import { boot } from '../../src/app/boot.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// The three tests share one page: the first presses the start button, the other two start the sortie again directly.
beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

const key = (type: string, code: string): KeyboardEvent => new KeyboardEvent(type, { code, bubbles: true });

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

// Runs frames until `done` says so, and fails when it never does.
async function until(done: () => boolean, tries = 240): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} frames`);
}

test('the start button begins a sortie on M1 B', () => {
  el<HTMLButtonElement>('#sbStart').click();
  expect(state).toBe('play');
  const current = game();
  expect(current.mech.z).toBe(current.map.bounds.maxZ - PLAY_TUNE.startMargin);
  expect(el('#sbApp').hidden).toBe(true);
});

test('the mech walks and shoots in the sortie', async () => {
  startSortie();
  const current = game();
  const startZ = current.mech.z;
  window.dispatchEvent(key('keydown', 'KeyW'));
  window.dispatchEvent(key('keydown', 'KeyJ'));
  let shots = 0;
  for (let i = 0; i < 30; i++) {
    await frame();
    shots += game().events.filter(event => event.kind === 'shot').length;
  }
  window.dispatchEvent(key('keyup', 'KeyW'));
  window.dispatchEvent(key('keyup', 'KeyJ'));
  expect(game().mech.z).toBeLessThan(startZ);
  expect(shots).toBeGreaterThan(0);
});

test('breaking every target shows the result', async () => {
  startSortie();
  const current = game();
  for (const target of current.targets) target.hp = 1;
  const pillbox = current.targets.find(target => target.id === 'pillbox-1');
  if (!pillbox) throw new Error('the map has no pillbox-1');
  current.mech.x = -33;
  current.mech.z = 5;
  current.mech.yaw = 0;
  window.dispatchEvent(key('keydown', 'KeyJ'));
  // the first shot brings one target down; the rest stay up, so the sortie goes on
  await until(() => pillbox.hp === 0);
  expect(state).toBe('play');
  // leave only the last target at one shot and finish it from its front
  for (const target of current.targets) if (target.id !== 'depot') target.hp = 0;
  current.mech.x = 53;
  current.mech.z = 51;
  current.mech.yaw = 0;
  await until(() => state === 'result');
  window.dispatchEvent(key('keyup', 'KeyJ'));
  expect(el('#sbResult').hidden).toBe(false);
  expect(el('#sbResultTime').textContent).toContain('0:');
});
