// The pillbox guidance (SB-2017): the first shot's radio line, the pillars that mark a pillbox's blast points from B,
// and the use prompt inside a point's ring. npm run shots. Not a test: it is not part of npm test or the CI (the drawn
// pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the
// shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { sendToScript } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const CAMERA_FRAMES = 40; // frames the camera takes to come round behind the mech

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

// No mortar shells while the camera settles and the picture is taken: the beach cue starts the barrage.
function quiet(): void {
  const current = game();
  current.barrages = [];
  current.shells = [];
}

// Puts the mech at (x, z) facing `yaw` (0 is the land) and lets the camera come round behind it.
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

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

test('pillbox-guide', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);
  LOOP.maxDt = 0;
  try {
    if (wanted('pillbox-guide-hit')) {
      // landward of line 3 and face to pillbox-1: the shot's tracer and the first suppression's radio line
      standAt(-33, 5);
      const current = game();
      current.bullets.push({
        weapon: 'autocannon',
        x: current.mech.x,
        y: current.mech.y + MECH_TUNE.chestHeight,
        z: current.mech.z,
        dx: 0,
        dy: 0,
        dz: -1,
        left: 40,
      });
      for (let i = 0; i < 30 && current.radio?.line !== 'm1.pillbox-charge'; i++) runSystems(1 / 60);
      await picture('pillbox-guide-hit');
    }
    if (wanted('pillbox-guide-marks')) {
      // in B, sea-side of line 3: the four pillbox pillars and line 3's two stand over the hedgehogs
      startSortie();
      await until(() => game().script.cutscene !== null);
      sendToScript(game(), { kind: 'skip' });
      await until(() => game().script.cutscene === null);
      standAt(20, 58);
      await picture('pillbox-guide-marks');
    }
    if (wanted('pillbox-guide-prompt')) {
      // in pillbox-1's side point's ring: the use prompt is up below the aim circle
      standAt(-41, -13);
      quiet();
      await picture('pillbox-guide-prompt');
    }
  } finally {
    LOOP.maxDt = 0.05;
  }
});
