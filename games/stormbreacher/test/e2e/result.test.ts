import { beforeAll, beforeEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el, lang, t } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { state } from '../../src/app/screen.ts';
import { boot } from '../../src/app/boot.ts';
import { SAVE_KEY, initSave, save } from '../../src/app/storage.ts';
import { AMMO_COST } from '../../src/data/economy.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

beforeEach(() => {
  localStorage.removeItem(SAVE_KEY);
  initSave();
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

const AMMO = AMMO_COST.autocannon + AMMO_COST.heavyGun;
const NET = 10000 + 1000 + 1000 - AMMO;
const num = (n: number): string => n.toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US');

// Starts a sortie and ends it as the script's end would: no damage, no retry, 600 s on the clock.
async function clearSortie(): Promise<void> {
  startSortie();
  const current = game();
  current.time = 600;
  current.cleared = true;
  await until(() => state === 'result');
}

test('the cleared result shows the breakdown and the funds', async () => {
  await clearSortie();
  const text = el('#sbResultPay').textContent ?? '';
  expect(el('#sbResultPay').hidden).toBe(false);
  expect(text).toContain(t('result.base', { cr: num(10000) }));
  expect(text).toContain(t('result.bonus.par', { cr: num(1000) }));
  expect(text).toContain(t('result.bonus.noRetry', { cr: num(1000) }));
  expect(text).not.toContain(t('result.bonus.depot', { cr: num(2000) }));
  expect(text).toContain(t('result.ammo', { cr: num(AMMO) }));
  expect(text).toContain(t('result.net', { cr: num(NET) }));
  expect(text).toContain(t('result.funds', { cr: num(NET) }));
  expect(text).not.toContain(t('result.noCredit'));
  expect(save.funds).toBe(NET);
  const stored = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}');
  expect(stored.funds).toBe(NET);
  expect(stored.records.missions.m1).toEqual({ cleared: true, bestSec: 600 });
});

test('the second clear shows the breakdown and a note, and the funds do not grow', async () => {
  await clearSortie();
  await clearSortie();
  const text = el('#sbResultPay').textContent ?? '';
  expect(text).toContain(t('result.net', { cr: num(NET) }));
  expect(text).toContain(t('result.funds', { cr: num(NET) }));
  expect(text).toContain(t('result.noCredit'));
  expect(save.funds).toBe(NET);
  expect(JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}').funds).toBe(NET);
});

test('the downed result has no breakdown and writes nothing', async () => {
  startSortie();
  const current = game();
  current.armor = 0;
  current.downed = true;
  await until(() => state === 'result');
  expect(el('#sbResultPay').hidden).toBe(true);
  expect(el('#sbResultPay').textContent).toBe('');
  expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  expect(save.funds).toBe(0);
});
