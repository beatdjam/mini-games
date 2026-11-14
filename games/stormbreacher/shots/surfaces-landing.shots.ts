// The beach seen over the mech's shoulder right after the landing (SB-1360's surfaces): the same ground, sea and props
// as the fixed shots in surfaces.shots.ts, but under the sortie's own look, so the sand's brightness and the sea's
// colour can be checked where the player sees them. npm run shots. Not a test: it is not part of npm test or the CI.
// SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, el } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it shows the frame after the cutscene ends
const SHOT_CLOCK = 1000; // what performance.now() says while a shot is taken (ms), so the sea's crests stand still
const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

async function until(done: () => boolean, tries = 240): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} frames`);
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('surfaces after landing', async () => {
  if (!wanted('surfaces-after-landing')) return;
  startSortie();
  // hold the loop and the clock: the mech and the sea stay where the landing left them while the page keeps drawing
  const maxDt = LOOP.maxDt;
  const now = performance.now;
  LOOP.maxDt = 0;
  performance.now = () => SHOT_CLOCK;
  try {
    await until(() => currentGame()?.script.cutscene != null);
    el('#gl').click(); // skip the cutscene, as a player can
    await until(() => currentGame()?.script.cutscene === null);
    for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
    await page.screenshot({ path: `${__SHOTS_OUT__}/surfaces-after-landing.png` });
  } finally {
    LOOP.maxDt = maxDt;
    performance.now = now;
  }
});
