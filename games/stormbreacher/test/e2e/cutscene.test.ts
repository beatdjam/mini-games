import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el, t } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { CUTSCENE_SEC } from '../../src/data/script.ts';
import { sendToScript } from '../../src/logic/game.ts';
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

// The crafts of the cutscenes that are in sight now (the player's own is `craftUnit`, not counted).
function seaCrafts(): number {
  let count = 0;
  scene.traverse(child => {
    if (/^craftSide\d+Unit$/.test(child.name) && child.visible) count++;
  });
  return count;
}

test('wave2-sinks shows the bars and its line, hides the HUD and draws the crafts at sea', async () => {
  startSortie();
  await until(() => !bars().hidden);
  el('#gl').click();
  await until(() => bars().hidden);
  expect(seaCrafts()).toBe(0);
  game().script.cutscene = { id: 'wave2-sinks', left: CUTSCENE_SEC['wave2-sinks'] - 1 };
  await frame();
  expect(bars().hidden).toBe(false);
  expect(el('#sbPlayHud').hidden).toBe(true);
  expect(caption()).toBe(t('cutscene.wave2.hit'));
  expect(seaCrafts()).toBe(4);
  game().script.cutscene = { id: 'wave2-sinks', left: CUTSCENE_SEC['wave2-sinks'] - 4 };
  await frame();
  expect(caption()).toBe(t('cutscene.wave2.none'));
  // when it is over the bars go, the HUD comes and the crafts are out of sight
  game().script.cutscene = null;
  await until(() => bars().hidden);
  expect(el('#sbPlayHud').hidden).toBe(false);
  expect(seaCrafts()).toBe(0);
});

test('beach-held plays after the win and then the result shows', async () => {
  startSortie();
  await until(() => !bars().hidden);
  el('#gl').click();
  await until(() => bars().hidden);
  for (const target of ['main-gun-1', 'main-gun-2', 'magazine']) sendToScript(game(), { kind: 'destroyed', target });
  expect(game().script.cutscene?.id).toBe('beach-held');
  await until(() => !bars().hidden);
  expect(game().cleared).toBe(true);
  expect(el('#sbResult').hidden).toBe(true);
  game().script.cutscene = { id: 'beach-held', left: CUTSCENE_SEC['beach-held'] - 5 };
  await frame();
  expect(caption()).toBe(t('cutscene.held.landing'));
  expect(seaCrafts()).toBe(2);
  // a skip ends it, and the result follows
  el('#gl').click();
  await until(() => !el('#sbResult').hidden);
  expect(bars().hidden).toBe(true);
});
