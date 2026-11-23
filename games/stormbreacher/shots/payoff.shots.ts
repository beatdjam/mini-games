// The milestones' payoff (SB-2010): line 1's breach, the second bunker's fall, and the front line on the HUD's radar.
// npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ between machines).
// SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { sendToScript } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';
import { CHARGE_TUNE } from '../src/data/charge.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const CAMERA_FRAMES = 40; // frames the camera takes to come round behind the mech
const HIDDEN_3D = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

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

// No mortar shells while the camera settles: the beach cue starts the barrage, and a landing would cover the picture.
function quiet(): void {
  const current = game();
  current.barrages = [];
  current.shells = [];
}

// Puts the mech at (x, z) facing `yaw` (0 is the land) and lets the camera come round behind it. The frames are run by
// hand, so the camera follows even while LOOP.maxDt holds the page's own loop at 0.
function standAt(x: number, z: number, yaw = 0): void {
  const current = game();
  current.mech.x = x;
  current.mech.z = z;
  current.mech.y = 0;
  current.mech.grounded = true;
  current.mech.yaw = yaw;
  for (let i = 0; i < CAMERA_FRAMES; i++) {
    quiet();
    runSystems(1 / 60);
  }
}

// Blows line 1's seaward point as the player's charge would, after the camera has settled.
function blowLine(): void {
  game().charges.push({ blast: 'l1-b', left: 0, total: CHARGE_TUNE.fuse });
}

// Breaks both pillboxes with a charge on each side point, as a player would (SB-2015: shots only suppress), so the
// game's own blast reports the falls.
function breakBoth(): void {
  const current = game();
  for (const id of ['blast-pillbox-1-side', 'blast-pillbox-2-side']) {
    current.charges.push({ blast: id, left: 0, total: CHARGE_TUNE.fuse });
  }
}

// The game's own seconds by hand, with the page still drawing each frame. The slow is not worked around: the seconds are
// the ones a player sees.
function advance(seconds: number): void {
  const steps = Math.max(1, Math.round(seconds * 60));
  for (let i = 0; i < steps; i++) runSystems(1 / 60);
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

test('payoff', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);

  // The 3D pictures, with the HUD out of the way: the blast at line 1 and the battlefield two seconds on.
  const hide = document.createElement('style');
  hide.textContent = HIDDEN_3D;
  document.head.appendChild(hide);
  LOOP.maxDt = 0;
  try {
    if (wanted('payoff-breach')) {
      // a little right of the point, so the mech does not cover the blast at (40, 146.5)
      standAt(48, 158);
      blowLine();
      runSystems(1 / 60);
      advance(0.3); // the fireball has grown and the hole is open
      await picture('payoff-breach-0');
      advance(1.7);
      await picture('payoff-breach-2s');
    }
    if (wanted('payoff-bunker')) {
      // restart so the line 1 shot does not decide this one, and stand behind the pillboxes
      startSortie();
      await until(() => game().script.cutscene !== null);
      sendToScript(game(), { kind: 'skip' });
      await until(() => game().script.cutscene === null);
      // landward of the pillboxes and facing the sea, so both stand clear in front and fall toward the camera
      standAt(0, -30, Math.PI);
      breakBoth();
      runSystems(1 / 60);
      advance(0.35); // the flash and the first of the fall
      await picture('payoff-bunker-0');
      advance(1.65);
      await picture('payoff-bunker-2s');
    }
  } finally {
    LOOP.maxDt = 0.05;
    hide.remove();
  }
});

test('payoff-hud', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);
  LOOP.maxDt = 0;
  try {
    if (wanted('payoff-front-beach')) {
      standAt(40, 158);
      await picture('payoff-front-beach');
    }
    if (wanted('payoff-front-line1')) {
      blowLine();
      runSystems(1 / 60);
      advance(1.25); // the blast, the heading and the delayed cheer are all on screen
      await picture('payoff-front-line1');
    }
    if (wanted('payoff-front-pillboxes')) {
      // a fresh sortie, so the second bunker's heading is the one on screen when cp1 moves the front to the pillbox line
      startSortie();
      await until(() => game().script.cutscene !== null);
      sendToScript(game(), { kind: 'skip' });
      await until(() => game().script.cutscene === null);
      standAt(0, -30, Math.PI);
      breakBoth();
      runSystems(1 / 60);
      advance(1.25); // the heading and the delayed cheer are on screen while the front moves
      await picture('payoff-front-pillboxes');
    }
  } finally {
    LOOP.maxDt = 0.05;
  }
});
