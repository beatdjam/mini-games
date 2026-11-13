// Screenshots of the radio band (SB-1580): the first line on screen, the second after it has had its time, and the band
// empty. The mock view keeps the same one-line-at-a-time rule as the sortie. npm run shots. Not a test: it is not part
// of npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go;
// SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { boot } from '../src/app/boot.ts';
import { showHud } from '../src/dev/views/hud.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN =
  'body > *:not(#gl):not(#sbHud) { visibility: hidden !important; } ' +
  '#sbHud, #sbHud * { visibility: visible !important; }'; // the 3D view and the HUD

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

interface HudReport {
  radio: string | null;
}

function report(): HudReport {
  if (!window.sbHudReport) throw new Error('the HUD view has no report');
  return JSON.parse(window.sbHudReport()) as HudReport;
}

async function until(done: () => boolean, tries = 600): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the view did not reach the state in ${tries} frames`);
}

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

test('radio', async () => {
  showHud('#view-hud');
  const flow = document.querySelector<HTMLButtonElement>('button[data-sb-radio="flow"]');
  if (!flow) throw new Error('the HUD view has no radio button');
  flow.click();

  await until(() => report().radio === 'm1.depot-hint');
  if (wanted('radio-first')) await picture('radio-first');

  // the second line comes up only after the first has had RADIO_TUNE.minSec on screen
  await until(() => report().radio === 'm1.pillboxes-down');
  if (wanted('radio-second')) await picture('radio-second');

  // and the band empties after the second line's time
  await until(() => report().radio === null);
  if (wanted('radio-gone')) await picture('radio-gone');
});
