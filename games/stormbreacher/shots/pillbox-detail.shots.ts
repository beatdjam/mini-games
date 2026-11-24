// The pillbox's look (SB-2050): pillbox-1 from the front and from an angle, with its muzzle warning, with its muzzle
// suppressed, and after a charge broke it (1 s in, and settled). npm run shots. Not a test: it is not part of npm test or the CI (the drawn
// pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the
// shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { CHARGE_TUNE } from '../src/data/charge.ts';
import { PILLBOX_TUNE } from '../src/data/pillbox.ts';
import { newEnemy } from '../src/logic/enemies.ts';
import { sendToScript } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const CAMERA_FRAMES = 40; // frames the camera takes to come round behind the mech
const PILLBOX = { id: 'pillbox-1', x: -33, z: -15 }; // the one in the pictures; its front is +z (the sea)

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

// Stands the mech at (x, z) looking at a point (aimDx, aimDz) metres off the pillbox's middle (so the mech does not
// stand in front of the pillbox in the picture), and lets the camera come round behind it. No mortar shells
// and no pillbox fire while it settles: both would cover the picture.
async function standAt(x: number, z: number, aimDx: number, aimDz = 0): Promise<void> {
  const current = game();
  current.mech.x = x;
  current.mech.z = z;
  current.mech.y = 0;
  current.mech.grounded = true;
  current.mech.yaw = Math.atan2(-(PILLBOX.x + aimDx - x), -(PILLBOX.z + aimDz - z));
  for (let i = 0; i < CAMERA_FRAMES; i++) {
    current.barrages = [];
    current.shells = [];
    current.enemies = [];
    quietPillboxes();
    runSystems(1 / 60);
  }
  quietPillboxes();
}

// Every pillbox waits, with no warning, burst or suppression running.
function quietPillboxes(): void {
  for (const state of game().pillboxes) {
    state.wait = 60;
    state.warn = 0;
    state.shots = 0;
    state.shotWait = 0;
    state.suppress = 0;
  }
}

function mine() {
  const state = game().pillboxes.find(pillbox => pillbox.id === PILLBOX.id);
  if (!state) throw new Error(`the map has no ${PILLBOX.id}`);
  return state;
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

test('pillbox-detail', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);
  LOOP.maxDt = 0;
  try {
    if (wanted('pillbox-front')) {
      await standAt(PILLBOX.x + 2, -4, -12);
      await picture('pillbox-front');
    }
    if (wanted('pillbox-angle')) {
      await standAt(PILLBOX.x - 15, -6, 0, 8);
      await picture('pillbox-angle');
    }
    if (wanted('pillbox-with-grunt')) {
      // the pillbox and a mass-produced mech in one picture, to judge the density against each other
      await standAt(PILLBOX.x + 6, 4, 8);
      const grunt = newEnemy('shot-detail-grunt', 'shot', 'grunt', PILLBOX.x + 12, -10);
      grunt.dormant = true;
      grunt.yaw = Math.PI;
      game().enemies.push(grunt);
      await picture('pillbox-with-grunt');
      game().enemies = [];
    }
    if (wanted('pillbox-far-30')) {
      await standAt(PILLBOX.x - 1, 17, -7);
      await picture('pillbox-far-30');
    }
    if (wanted('pillbox-far-60')) {
      await standAt(PILLBOX.x - 1, 43, -7);
      await picture('pillbox-far-60');
    }
    if (wanted('pillbox-warn')) {
      await standAt(PILLBOX.x + 2, -4, -11);
      mine().warn = PILLBOX_TUNE.warn * 0.7;
      await picture('pillbox-warn');
    }
    if (wanted('pillbox-suppress')) {
      await standAt(PILLBOX.x + 2, -4, -11);
      mine().suppress = PILLBOX_TUNE.suppressSec * 0.8;
      await picture('pillbox-suppress');
    }
    if (wanted('pillbox-broken')) {
      // (this takes pillbox-broken and pillbox-broken-end)
      await standAt(PILLBOX.x - 15, -6, 0, 8);
      game().charges.push({ blast: 'blast-pillbox-1-side', left: 0, total: CHARGE_TUNE.fuse });
      // 1 s in the pillbox is sinking and leaning; at 3 s it has settled into the sand
      for (let i = 0; i < 60; i++) runSystems(1 / 60);
      await picture('pillbox-broken');
      for (let i = 0; i < 60 * 2; i++) runSystems(1 / 60);
      await picture('pillbox-broken-end');
    }
  } finally {
    LOOP.maxDt = 0.05;
  }
});
