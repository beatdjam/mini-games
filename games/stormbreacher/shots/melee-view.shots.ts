// Screenshot of the mech's blow in #view-mech (SB-1756): the prototype's free left arm throws it, so the view's own
// "殴る" action (key Q) is played and the picture is taken on the frame the blow lands. npm run shots. Not a test: it is
// not part of npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the picture
// goes; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems } from '@engine/core/index.ts';
import { boot } from '../src/app/boot.ts';
import { meleeHitSec } from '../src/data/melee.ts';
import { showMech } from '../src/dev/views/mech.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

async function picture(name: string): Promise<void> {
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('melee-view', async () => {
  if (!wanted('melee-view')) return;
  const params = new URLSearchParams(location.search);
  params.set('kit', 'player');
  params.set('spin', '0');
  params.set('view', 'behind');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}#view-mech`);
  showMech('#view-mech');

  // The view's own system runs the action; the page's loop is stilled so each frame is exactly 1/60 s of it.
  LOOP.maxDt = 0;
  for (let i = 0; i < DRAWN_FRAMES; i++) runSystems(1 / 60);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
  const frames = Math.ceil(meleeHitSec() * 60) + 1;
  for (let i = 0; i < frames; i++) runSystems(1 / 60);
  await picture('melee-view');
  LOOP.maxDt = 0.05;
});
