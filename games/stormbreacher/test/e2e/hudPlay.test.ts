import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el, t } from '@engine/core/index.ts';
import { CAMERA_TUNE } from '../../src/data/tune.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import { currentGame, startSortie, showResult } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// The tests share one page: each starts the sortie again directly.
beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

const key = (type: string, code: string): KeyboardEvent => new KeyboardEvent(type, { code, bubbles: true });

test('a sortie shows the HUD', () => {
  startSortie();
  const hud = el('#sbPlayHud');
  for (const id of ['armor', 'boost', 'main', 'sub', 'objective', 'radio', 'radar', 'reticle', 'warning'])
    expect(hud.querySelector(`[data-hud="${id}"]`), `the HUD is missing ${id}`).not.toBeNull();
  expect(hud.querySelector('[data-hud="warning"]')?.hasAttribute('hidden'), 'no warning at the start').toBe(true);
  expect(hud.querySelector('[data-hud="radio"]')?.hasAttribute('hidden'), 'no radio line at the start').toBe(true);
  expect(hud.querySelector('[data-hud="heat"]'), 'the HUD should not have heat').toBeNull();
  expect(document.querySelector('#sbHud')).toBeNull();
});

test('the ammo count follows the shots', async () => {
  startSortie();
  const text = (): string => el('#sbPlayHud [data-hud="main"]').textContent ?? '';
  const shotsLeft = (): number => {
    const hit = /(\d+)\s*\/\s*(\d+)/.exec(text());
    if (!hit) throw new Error(`the main ammo is not in the HUD: "${text()}"`);
    return Number(hit[1]);
  };
  // the HUD is filled on the first frame of the sortie
  await frame();
  expect(shotsLeft()).toBe(WEAPONS.autocannon.ammo);
  window.dispatchEvent(key('keydown', 'KeyJ'));
  for (let i = 0; i < 30; i++) await frame();
  window.dispatchEvent(key('keyup', 'KeyJ'));
  expect(shotsLeft()).toBeLessThan(WEAPONS.autocannon.ammo);
});

test('starting again leaves one HUD', () => {
  startSortie();
  startSortie();
  expect(document.querySelectorAll('#sbPlayHud').length).toBe(1);
});

test('the result hides the HUD', () => {
  startSortie();
  showResult();
  expect(el('#sbPlayHud').hidden).toBe(true);
});

test("the objective is the script's first one", async () => {
  startSortie();
  await frame();
  const objective = el('#sbPlayHud [data-hud="objective"]');
  expect(objective.hidden).toBe(false);
  expect(objective.textContent).toContain(t('obj.reach-pillboxes'));
});

test('the lock frame shows only while the aim is pulled toward a target', async () => {
  startSortie();
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  await frame();
  const lock = el('#sbPlayHud [data-hud="lock"]');
  expect(game.aimTarget).toBeNull();
  expect(lock.hidden).toBe(true);

  // in front of pillbox-1; the camera sits to the mech's right, so the mech stands that far to its left
  game.mech.x = -33 - CAMERA_TUNE.shoulder;
  game.mech.z = 5;
  game.mech.yaw = 0;
  for (let i = 0; i < 120 && game.aimTarget === null; i++) await frame();
  expect(game.aimTarget).not.toBeNull();
  await frame();
  expect(lock.hidden).toBe(false);
  expect(lock.getBoundingClientRect().width).toBeGreaterThan(0);

  game.mech.x = 0;
  game.mech.z = 140;
  for (let i = 0; i < 120 && game.aimTarget !== null; i++) await frame();
  expect(game.aimTarget).toBeNull();
  await frame();
  expect(lock.hidden).toBe(true);
});
