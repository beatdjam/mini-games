import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el, t } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { CUTSCENE_SEC } from '../../src/data/script.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// The tests share one page: each starts the sortie again directly.
beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

async function until(done: () => boolean, tries = 240): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} frames`);
}

const bars = (): HTMLElement => el('#sbCutscene');
const caption = (): string => el('#sbCutscene [data-cutscene="caption"]').textContent ?? '';

test('a sortie shows the black bars and a line, and hides the HUD', async () => {
  startSortie();
  await until(() => !bars().hidden);
  expect(el('#sbPlayHud').hidden).toBe(true);
  expect(bars().querySelectorAll('[data-cutscene="top"], [data-cutscene="bottom"]')).toHaveLength(2);
  const bottom = el('#sbCutscene [data-cutscene="bottom"]').getBoundingClientRect();
  expect(bottom.height).toBeGreaterThan(0);
  expect(bottom.bottom).toBe(window.innerHeight);
  // the line is in the lower bar once the first line's second comes
  expect(game().script.cutscene?.id).toBe('landing');
  game().script.cutscene = { id: 'landing', left: CUTSCENE_SEC.landing - 1 };
  await frame();
  expect(caption()).toBe(t('cutscene.landing.wave'));
});

test('a click skips the cutscene: the bars go and the HUD comes', async () => {
  startSortie();
  await until(() => !bars().hidden);
  el('#gl').click();
  await until(() => bars().hidden);
  expect(game().script.cutscene).toBeNull();
  expect(el('#sbPlayHud').hidden).toBe(false);
});

test('Enter skips it too, and the click that started the sortie does not', async () => {
  startSortie();
  await frame();
  expect(game().script.cutscene).not.toBeNull();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', repeat: true, bubbles: true }));
  await frame();
  expect(game().script.cutscene).not.toBeNull();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
  await until(() => game().script.cutscene === null);
  expect(bars().hidden).toBe(true);
});

test('starting again from the beginning plays it again, with one set of bars', async () => {
  startSortie();
  await until(() => !bars().hidden);
  el('#gl').click();
  await until(() => bars().hidden);
  el('#sbResultRestart').click();
  await until(() => !bars().hidden);
  expect(document.querySelectorAll('#sbCutscene')).toHaveLength(1);
  expect(game().script.cutscene?.id).toBe('landing');
  expect(el('#sbPlayHud').hidden).toBe(true);
});
