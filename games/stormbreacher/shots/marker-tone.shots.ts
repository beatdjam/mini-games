// The blast points' lights in the three ways they show (SB-2022), and SB-2017's look for comparison, from the same place
// just after a pillbox was first shot. npm run shots. Not a test: it is not part of npm test or the CI (the drawn
// pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the
// shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { MARKER_MODES, MARKER_TUNE, type MarkerMode } from '../src/data/marker.ts';
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

const OLD_LOOK = { pillarHeight: 7, pillarBaseRadius: 0.45, diamondSize: 1.5, diamondLift: 10, brightness: 1 };

function setMode(mode: MarkerMode): void {
  MARKER_TUNE.mode = MARKER_MODES.indexOf(mode);
}

test('marker-tone', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);
  LOOP.maxDt = 0;
  const tuned = { ...MARKER_TUNE };
  try {
    // landward of line 2, face to pillbox-1, just after the first shot has landed on both pillboxes
    for (const state of game().pillboxes) state.shot = true;
    standAt(-33, 12);
    quiet();
    for (const name of ['dim', 'map', 'next'] as const) {
      if (!wanted(`marker-${name}`)) continue;
      setMode(name);
      await picture(`marker-${name}`);
    }
    if (wanted('marker-old')) {
      setMode('dim');
      Object.assign(MARKER_TUNE, OLD_LOOK);
      await picture('marker-old');
      Object.assign(MARKER_TUNE, tuned);
    }
    if (wanted('marker-near')) {
      // close to pillbox-1's side point: the light has faded out and the ring and the prompt are left
      setMode('next');
      standAt(-41, -9);
      quiet();
      await picture('marker-near');
    }
    if (wanted('marker-cutscene')) {
      game().script.cutscene = { id: 'landing', left: 5 };
      await picture('marker-cutscene');
      game().script.cutscene = null;
    }
  } finally {
    Object.assign(MARKER_TUNE, tuned);
    LOOP.maxDt = 0.05;
  }
});
