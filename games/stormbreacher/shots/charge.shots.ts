// Screenshots of the blast point and the charge on line 1 (SB-1500): the point's ring, the hold's progress, the planted
// charge, and the blast. npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ between
// machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { CHARGE_TUNE } from '../src/data/charge.ts';
import { sendToScript } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const MECH_X = 40; // the breakthrough on line 1 (m)
const MECH_Z = 150; // just sea-side of the line (m)
const HIDDEN =
  'body > *:not(#gl):not(#sbPlayHud) { visibility: hidden !important; } ' +
  '#sbPlayHud, #sbPlayHud * { visibility: visible !important; }'; // the 3D view and the HUD

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

async function until(done: () => boolean, tries = 600): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} frames`);
}

async function picture(name: string): Promise<void> {
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

// Holds the game still while the picture is taken, so the hold (or the charge or the blast) is the one that was set up.
function freeze(): () => void {
  const maxDt = LOOP.maxDt;
  LOOP.maxDt = 0;
  return () => {
    LOOP.maxDt = maxDt;
  };
}

const key = (type: 'keydown' | 'keyup') =>
  window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyF', bubbles: true }));

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('charge', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);

  const g = game();
  g.mech.x = MECH_X;
  g.mech.z = MECH_Z;
  g.mech.y = 0;
  g.mech.grounded = true;
  g.mech.yaw = 0;
  // no mortar shells while the pictures are taken: the beach cue starts the barrage one frame after the skip
  const quiet = () => {
    const current = game();
    current.barrages = [];
    current.shells = [];
  };
  quiet();
  // the camera follows the mech with a lag, so it is given time to come round behind it
  for (let i = 0; i < 30; i++) await frame();
  quiet();
  for (let i = 0; i < 20; i++) await frame();

  if (wanted('charge-point')) {
    const release = freeze();
    await picture('charge-point');
    release();
  }

  key('keydown');
  await until(() => {
    const current = game();
    return current.plant !== null && current.plant.hold >= CHARGE_TUNE.holdSec * 0.5;
  });
  if (wanted('charge-hold')) {
    const release = freeze();
    await picture('charge-hold');
    release();
  }

  await until(() => game().charges.length > 0);
  if (wanted('charge-planted')) {
    const release = freeze();
    await picture('charge-planted');
    release();
  }

  key('keyup');
  game().charges[0].left = 0.001;
  await until(() => game().charges.length === 0);
  // let the blast's fire and smoke grow a little before the picture is held
  for (let i = 0; i < 15; i++) await frame();
  if (wanted('charge-blast')) {
    const release = freeze();
    await picture('charge-blast');
    release();
  }
});
