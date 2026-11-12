import { beforeAll, beforeEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el, t } from '@engine/core/index.ts';
import { boot } from '../../src/app/boot.ts';
import { briefingUI } from '../../src/app/briefing.ts';
import { continueSortie, currentGame, syncTitle, titleReturn } from '../../src/app/play.ts';
import { setState, state } from '../../src/app/screen.ts';
import { SUSPEND_KEY, writeSuspend } from '../../src/app/storage.ts';
import { M1_BRIEFING } from '../../src/data/briefings.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { newGame } from '../../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(844, 390); // a phone laid on its side
  boot();
  titleReturn.reload = false;
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

const button = (id: string): HTMLButtonElement => el<HTMLButtonElement>(id);
const lines = (): string[] => [...document.querySelectorAll('#sbBriefingLines p')].map(p => p.textContent ?? '');
const press = (code: string): void => void window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));

// Each test starts on the title with no suspend.
beforeEach(() => {
  localStorage.removeItem(SUSPEND_KEY);
  el('#sbBriefing').hidden = true;
  el('#sbApp').hidden = false;
  setState('title');
  syncTitle();
});

// Opens the briefing as the title's start button does, and waits a frame so a press after it is not the opening one.
async function open(): Promise<void> {
  button('#sbStart').click();
  await frame();
}

test('the start button opens the briefing, not the sortie', async () => {
  await open();
  expect(state).toBe('briefing');
  expect(el('#sbBriefing').hidden).toBe(false);
  expect(el('#sbApp').hidden).toBe(true);
  expect(lines()).toEqual([t(M1_BRIEFING[0]?.key ?? '')]);
  expect(button('#sbBriefingGo').hidden).toBe(true);
  expect(button('#sbBriefingSkip').hidden).toBe(false);
  const map = el<HTMLCanvasElement>('#sbBriefingMap');
  const box = map.getBoundingClientRect();
  expect(box.height).toBeLessThanOrEqual(390);
  expect(box.width).toBeGreaterThan(0);
  // the first symbol (the battery) is drawn: some pixel of the canvas is not the plain land
  const data = map.getContext('2d')?.getImageData(0, 0, map.width, map.height).data ?? [];
  expect(data.some(v => v !== 0)).toBe(true);
});

test('a tap brings the next line, and Enter and Space do too', async () => {
  await open();
  el('#sbBriefing').click();
  expect(lines()).toHaveLength(2);
  expect(lines()[1]).toBe(t(M1_BRIEFING[1]?.key ?? ''));
  expect(briefingUI.time).toBe(M1_BRIEFING[1]?.at);
  press('Enter');
  expect(lines()).toHaveLength(3);
  press('Space');
  expect(lines()).toHaveLength(4);
  expect(state).toBe('briefing');
});

test('the lines also come by themselves with time', async () => {
  await open();
  briefingUI.time = (M1_BRIEFING[1]?.at ?? 0) - 0.01;
  await frame();
  await frame();
  expect(lines()).toHaveLength(2);
});

test('when all lines are out the sortie button shows and a press goes to the sortie, with the landing cutscene first', async () => {
  await open();
  for (let i = 1; i < M1_BRIEFING.length; i++) el('#sbBriefing').click();
  expect(lines()).toHaveLength(M1_BRIEFING.length);
  expect(button('#sbBriefingGo').hidden).toBe(false);
  expect(button('#sbBriefingSkip').hidden).toBe(true);
  expect(state).toBe('briefing');
  el('#sbBriefing').click();
  expect(state).toBe('play');
  expect(el('#sbBriefing').hidden).toBe(true);
  // the sortie's first step starts the cutscene; the press that left the briefing does not skip it
  await frame();
  await frame();
  expect(currentGame()?.script.cutscene?.id).toBe('landing');
});

test('the sortie button goes to the sortie too', async () => {
  await open();
  for (let i = 1; i < M1_BRIEFING.length; i++) press('Enter');
  button('#sbBriefingGo').click();
  expect(state).toBe('play');
});

test('Esc skips the briefing at any line', async () => {
  await open();
  press('Escape');
  expect(state).toBe('play'); // the Esc that skips the briefing does not also pause the sortie
  await frame();
  await frame();
  expect(state).toBe('play');
  expect(currentGame()?.script.cutscene?.id).toBe('landing');
});

test('the skip button goes to the sortie at the first line', async () => {
  await open();
  expect(lines()).toHaveLength(1);
  button('#sbBriefingSkip').click();
  expect(state).toBe('play');
});

test('Enter on the title opens the briefing once, and the same Enter does not bring a line', async () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
  expect(state).toBe('briefing');
  expect(lines()).toHaveLength(1);
  await frame();
  expect(lines()).toHaveLength(1);
  expect(state).toBe('briefing');
});

test('"continue" does not show the briefing', () => {
  writeSuspend(newGame(M1B_HAND));
  continueSortie();
  expect(state).toBe('play');
  expect(el('#sbBriefing').hidden).toBe(true);
});

test('the retry from the result does not show the briefing', async () => {
  await open();
  press('Escape');
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  game.downed = true;
  for (let i = 0; i < 240 && state !== 'result'; i++) await frame();
  expect(state).toBe('result');
  button('#sbResultRestart').click();
  expect(state).toBe('play');
  expect(el('#sbBriefing').hidden).toBe(true);
  expect(currentGame()).not.toBe(game);
});
