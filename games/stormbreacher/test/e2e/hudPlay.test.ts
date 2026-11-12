import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el } from '@engine/core/index.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import { startSortie, showResult } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// The four tests share one page: each starts the sortie again directly.
beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

const key = (type: string, code: string): KeyboardEvent => new KeyboardEvent(type, { code, bubbles: true });

test('a sortie shows the HUD', () => {
  startSortie();
  const hud = el('#sbPlayHud');
  for (const id of ['armor', 'boost', 'main', 'sub', 'objective', 'radar', 'reticle'])
    expect(hud.querySelector(`[data-hud="${id}"]`), `the HUD is missing ${id}`).not.toBeNull();
  for (const id of ['heat', 'radio', 'warning'])
    expect(hud.querySelector(`[data-hud="${id}"]`), `the HUD should not have ${id}`).toBeNull();
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
