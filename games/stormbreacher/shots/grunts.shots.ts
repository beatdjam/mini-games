// Screenshots of the three enemy roles (#view-grunts, SB-1480): grunt, assault and heavy side by side, from 10m and from
// 80m, so the silhouettes can be compared. npm run shots. Not a test: it is not part of npm test or the CI (the drawn
// pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots
// whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { showGrunts, type GruntsShow } from '../src/dev/views/grunts.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

let show: GruntsShow;

beforeAll(async () => {
  await page.viewport(1280, 720);
  show = showGrunts('#view-grunts');
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

async function picture(name: string, distance: number): Promise<void> {
  show.setDistance(distance);
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

test('grunts', async () => {
  if (wanted('grunts-near')) await picture('grunts-near', 10);
  if (wanted('grunts-far')) await picture('grunts-far', 80);
});
