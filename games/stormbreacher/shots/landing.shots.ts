// Screenshots of the landing, where the ramp comes down while the mech stands on the deck and the game's camera takes over
// (SB-1230): npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ between machines).
// SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, el } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { CUTSCENE_SEC } from '../src/data/script.ts';
import { FEEL_TUNE } from '../src/data/tune.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

// The landing's seconds to take: the outside shot along the row of craft, the cut inside at 3.45, the near craft to port,
// the riders before and after the near shell, the raised ramp and its coming down (9.2 to 10.8), the machine gun's
// sweep (11.0 to 11.4) and the change to the game's camera.
const LANDING_AT = [0, 1.6, 3.4, 3.5, 5.4, 6.0, 6.4, 6.6, 9.2, 10.8, 11.0, 11.6, 11.95] as const;
const HELD_DT = 0; // the loop's step while a shot is taken: the cutscene's second stands still, the page still draws
const SHOT_CLOCK = 1000; // what performance.now() says while a shot is taken (ms)
const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
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

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  // the held step cannot let a blast's shake die away; with it off the camera sits on the key the picture is taken at
  FEEL_TUNE.shakeMax = 0;
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

// Holds the loop and the clock still, and returns what puts them back. The other games' shots hold their systems; this
// game has no helper for that, so its step runs with no time instead: the cutscene's second stays where `left` puts it
// and the page still draws each frame.
function hold(): () => void {
  const maxDt = LOOP.maxDt;
  const now = performance.now;
  LOOP.maxDt = HELD_DT;
  performance.now = () => SHOT_CLOCK;
  return () => {
    LOOP.maxDt = maxDt;
    performance.now = now;
  };
}

// The 3D view as the camera sees it, with the cutscene at `left` seconds. The HUD, the bars and the line are hidden so
// the ramp and the mech are not covered.
async function shot(name: string, left: number | null) {
  if (left !== null) game().script.cutscene = { id: 'landing', left };
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

test('landing', async () => {
  startSortie();
  // (the clock is held first: the sortie's cutscene starts at its first step, which waits for a frame)
  const release = hold();
  try {
    await until(() => game().script.cutscene !== null);
    for (const at of LANDING_AT) {
      const name = `landing-${at}`;
      if (wanted(name)) await shot(name, CUTSCENE_SEC.landing - at);
    }
    if (wanted('landing-after-skip')) {
      el('#gl').click();
      await until(() => game().script.cutscene === null);
      await shot('landing-after-skip', null);
    }
  } finally {
    release();
  }
});
