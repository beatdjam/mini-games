// Screenshots of the signs of being under fire (SB-1380): the red edge a hit from the right lights, the white flash of a
// blast close by, and the dark, drained edge at 25% armour. npm run shots. Not a test: it is not part of npm test or the
// CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text>
// takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { sendToScript } from '../src/logic/game.ts';
import { clearBooms, drawBooms, spawnBoom } from '../src/view/boom.ts';
import { currentHurtView, hurtBlast, hurtDamage } from '../src/view/hurt.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const SHOT_CLOCK = 1000; // what performance.now() says while a shot is taken (ms)
const BOOM_AGE = 0.25; // how far into the blast the picture is taken (s)
const BLAST_SIDE = 6; // how far to the mech's right the close blast goes (m)
const HIDDEN =
  'body > *:not(#gl):not(#sbPlayHurt) { visibility: hidden !important; } ' +
  '#sbPlayHurt, #sbPlayHurt * { visibility: visible !important; }'; // only the 3D view and the hurt overlay

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

function hurt() {
  const view = currentHurtView();
  if (!view) throw new Error('the hurt view has not been built');
  return view;
}

async function until(done: () => boolean, tries = 300): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} frames`);
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

// Holds the loop still, so the glow and the white do not fade while the picture is taken. The page still draws each frame.
function hold(): () => void {
  const maxDt = LOOP.maxDt;
  const now = performance.now;
  LOOP.maxDt = 0;
  performance.now = () => SHOT_CLOCK;
  return () => {
    LOOP.maxDt = maxDt;
    performance.now = now;
  };
}

async function picture(name: string): Promise<void> {
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

test('hurt', async () => {
  startSortie();
  // the intro cutscene covers the screen; pass it over so the shots show the game's own camera
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);

  const release = hold();
  try {
    if (wanted('hurt-right')) {
      hurt().edgeLeft.fill(0);
      hurt().flashLeft = 0;
      hurtDamage(hurt(), 1, 0, game().mech.yaw);
      await picture('hurt-right');
    }

    if (wanted('hurt-blast')) {
      hurt().edgeLeft.fill(0);
      hurt().flashLeft = 0;
      const x = game().mech.x + BLAST_SIDE;
      const z = game().mech.z;
      spawnBoom('large', x, 0.8, z);
      drawBooms(BOOM_AGE);
      hurtBlast(hurt(), x, z, game().mech);
      await picture('hurt-blast');
    }

    if (wanted('hurt-armor')) {
      // the blast of the last picture would hide the edge; this picture is only the armour's darkening
      clearBooms();
      hurt().flashLeft = 0;
      hurt().edgeLeft.fill(0);
      game().armor = MECH_TUNE.armor * 0.25;
      await picture('hurt-armor');
    }
  } finally {
    release();
  }
});
