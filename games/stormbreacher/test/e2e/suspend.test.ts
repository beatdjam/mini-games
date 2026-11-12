import { beforeAll, beforeEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el, t } from '@engine/core/index.ts';
import { boot } from '../../src/app/boot.ts';
import { currentGame, startSortie, syncTitle, titleReturn } from '../../src/app/play.ts';
import { state } from '../../src/app/screen.ts';
import { SAVE_KEY, SUSPEND_KEY, loadSuspend, save } from '../../src/app/storage.ts';
import { sendToScript } from '../../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  // the real page loads again to go back to the title; a test cannot, so it takes the in-page way
  titleReturn.reload = false;
});

// Each test starts with no suspend and no sortie, on the title.
beforeEach(() => {
  localStorage.removeItem(SUSPEND_KEY);
  startSortie();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));
const frames = async (n: number): Promise<void> => {
  for (let i = 0; i < n; i++) await frame();
};

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

const press = (code: string): boolean => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
const button = (id: string): HTMLButtonElement => el<HTMLButtonElement>(id);
const menu = (): HTMLElement => el('#sbPause');

// Skips the opening cutscene, so Esc is a pause key.
async function pastCutscene(): Promise<void> {
  await frame();
  press('Enter');
  await until(() => game().script.cutscene === null);
}

// Takes cp1, then moves the mech and spends armour, so the game has something to bring back.
async function playedSortie(): Promise<void> {
  await pastCutscene();
  const current = game();
  sendToScript(current, { kind: 'destroyed', target: 'pillbox-1' });
  sendToScript(current, { kind: 'destroyed', target: 'pillbox-2' });
  current.mech.x = -12;
  current.mech.z = 40;
  current.armor -= 200;
  current.retries = 1;
  await frames(5);
}

test('P pauses: the menu comes, the clock stops and the pointer lock goes', async () => {
  await pastCutscene();
  expect(button('#sbPauseBtn').hidden).toBe(false);
  press('KeyP');
  expect(state).toBe('paused');
  expect(menu().hidden).toBe(false);
  expect(button('#sbPauseResume').textContent).toBe(t('pause.resume'));
  expect(button('#sbPauseSuspend').textContent).toBe(t('pause.suspend'));
  expect(button('#sbPauseAbandon').textContent).toBe(t('pause.abandon'));
  const time = game().time;
  await frames(10);
  expect(game().time).toBe(time);
  expect(document.pointerLockElement).toBeNull();
});

test('the resume button goes back to the sortie and the clock runs again', async () => {
  await pastCutscene();
  press('KeyP');
  button('#sbPauseResume').click();
  expect(state).toBe('play');
  expect(menu().hidden).toBe(true);
  const time = game().time;
  await frames(5);
  expect(game().time).toBeGreaterThan(time);
});

test('Esc pauses outside a cutscene and closes the menu again', async () => {
  await pastCutscene();
  press('Escape');
  expect(state).toBe('paused');
  press('Escape');
  expect(state).toBe('play');
});

test('the pause button pauses', async () => {
  await pastCutscene();
  button('#sbPauseBtn').click();
  expect(state).toBe('paused');
});

test('Esc in a cutscene skips it and does not pause', async () => {
  await frame();
  expect(game().script.cutscene).not.toBeNull();
  press('Escape');
  await until(() => game().script.cutscene === null);
  expect(state).toBe('play');
  expect(menu().hidden).toBe(true);
});

test('pausing in a cutscene with P does not skip it, and the resume does not either', async () => {
  await frame();
  press('KeyP');
  expect(state).toBe('paused');
  button('#sbPauseResume').click();
  await frames(5);
  expect(game().script.cutscene).not.toBeNull();
});

test('suspend goes to the title with "continue"; continue brings the same sortie back and the suspend goes', async () => {
  await playedSortie();
  const before = game();
  const mech = { x: before.mech.x, z: before.mech.z };
  const armor = before.armor;
  const time = before.time;
  press('KeyP');
  button('#sbPauseSuspend').click();
  expect(state).toBe('title');
  expect(currentGame()).toBeNull();
  expect(el('#sbApp').hidden).toBe(false);
  expect(menu().hidden).toBe(true);
  expect(button('#sbPauseBtn').hidden).toBe(true);
  expect(button('#sbContinue').hidden).toBe(false);
  expect(button('#sbContinue').textContent).toBe(t('app.continue'));
  expect(localStorage.getItem(SUSPEND_KEY)).not.toBeNull();

  button('#sbContinue').click();
  expect(state).toBe('play');
  expect(el('#sbApp').hidden).toBe(true);
  expect(game().mech.x).toBe(mech.x);
  expect(game().mech.z).toBe(mech.z);
  expect(game().armor).toBe(armor);
  expect(game().time).toBe(time);
  expect(game().retries).toBe(1);
  expect(game().checkpoint?.id).toBe('cp1');
  // one suspend gives one sortie back
  expect(localStorage.getItem(SUSPEND_KEY)).toBeNull();
  expect(loadSuspend()).toBeNull();
  await frames(3);
  expect(game().time).toBeGreaterThan(time);
});

test('the title after a continue and an abandon has no "continue"', async () => {
  await playedSortie();
  press('KeyP');
  button('#sbPauseSuspend').click();
  button('#sbContinue').click();
  press('KeyP');
  button('#sbPauseAbandon').click();
  button('#sbAbandonYes').click();
  expect(state).toBe('title');
  expect(button('#sbContinue').hidden).toBe(true);
});

test('abandon asks once, says the result, and a "no" goes back to the menu', async () => {
  await pastCutscene();
  press('KeyP');
  button('#sbPauseAbandon').click();
  expect(state).toBe('paused');
  expect(button('#sbAbandonYes').hidden).toBe(false);
  expect(button('#sbAbandonYes').textContent).toBe(t('pause.abandonYes'));
  expect(button('#sbAbandonNo').hidden).toBe(false);
  expect(button('#sbPauseResume').hidden).toBe(true);
  button('#sbAbandonNo').click();
  expect(state).toBe('paused');
  expect(button('#sbPauseResume').hidden).toBe(false);
  expect(button('#sbAbandonYes').hidden).toBe(true);
});

test('abandon, once confirmed, goes to the title with no suspend and no reward written', async () => {
  await pastCutscene();
  const game0 = game();
  game0.cleared = false;
  const funds = save.funds;
  const stored = localStorage.getItem(SAVE_KEY);
  press('KeyP');
  button('#sbPauseAbandon').click();
  button('#sbAbandonYes').click();
  expect(state).toBe('title');
  expect(currentGame()).toBeNull();
  expect(localStorage.getItem(SUSPEND_KEY)).toBeNull();
  expect(button('#sbContinue').hidden).toBe(true);
  expect(save.funds).toBe(funds);
  expect(localStorage.getItem(SAVE_KEY)).toBe(stored);
});

test('Esc closes the abandon question before it resumes', async () => {
  await pastCutscene();
  press('KeyP');
  button('#sbPauseAbandon').click();
  press('Escape');
  expect(state).toBe('paused');
  expect(button('#sbAbandonYes').hidden).toBe(true);
});

test('start with a suspend asks first; the second press starts and the suspend goes', async () => {
  await playedSortie();
  press('KeyP');
  button('#sbPauseSuspend').click();
  button('#sbStart').click();
  expect(state).toBe('title');
  expect(button('#sbStart').textContent).toBe(t('app.startOver'));
  expect(localStorage.getItem(SUSPEND_KEY)).not.toBeNull();
  button('#sbStart').click();
  expect(state).toBe('briefing');
  button('#sbBriefingSkip').click(); // the briefing is test/e2e/briefing.test.ts's
  expect(state).toBe('play');
  expect(localStorage.getItem(SUSPEND_KEY)).toBeNull();
  expect(game().retries).toBe(0);
});

test('a suspend that cannot be read is thrown away and the title shows no "continue"', () => {
  for (const bad of ['{"v":', '"text"', JSON.stringify({ v: 99, map: 'm1b-hand', mission: 'm1' })]) {
    localStorage.setItem(SUSPEND_KEY, bad);
    syncTitle();
    expect(button('#sbContinue').hidden).toBe(true);
    expect(localStorage.getItem(SUSPEND_KEY)).toBeNull();
  }
});
