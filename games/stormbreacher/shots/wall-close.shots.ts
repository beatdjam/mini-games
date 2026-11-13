// Screenshots of the camera against a wall and of a shot at a grunt close in (SB-1910): the mech with its back to the
// seawall, the camera at a wall's corner, and a burst at grunts 3 to 8 m ahead. npm run shots. Not a test: it is not part
// of npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go;
// SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { CAMERA_TUNE } from '../src/data/tune.ts';
import { newEnemy } from '../src/logic/enemies.ts';
import { sendToScript, step } from '../src/logic/game.ts';
import { aimRay } from '../src/view/camera.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
const SETTLE = 60; // frames the camera gets to come to its place (at 60 fps, one second)
const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const SEAWALL_X = 20; // a piece of the seawall's middle (m)
const SEAWALL_FACE = -65; // the seawall's near face on +z (m)
const CORNER_X = 92; // the seawall's east end, under the cliff at x 100 (m)
const CLOSE_DISTS = [3, 5, 8]; // the grunts' distance ahead (m)

const idle = { moveX: 0, moveZ: 0, turn: 0, jump: false, jumpHeld: false, boost: false, fire: false, sub: false };
const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

async function until(done: () => boolean, tries = 300): Promise<void> {
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

// Puts the mech at (x, z) facing `yaw` and lets the camera settle against the walls there.
async function stand(x: number, z: number, yaw: number): Promise<void> {
  const g = game();
  g.mech.x = x;
  g.mech.z = z;
  g.mech.yaw = yaw;
  g.mech.vx = 0;
  g.mech.vz = 0;
  for (let n = 0; n < SETTLE; n++) await frame();
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('wall-close', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);

  // the mech's back is 1 m from the seawall: the camera is pushed to minDist and lifted over its shoulder
  if (wanted('wall-close-back')) {
    await stand(SEAWALL_X, SEAWALL_FACE + 1, 0);
    await picture('wall-close-back');
  }

  // the east end of the seawall and the cliff make a corner the camera turns around
  if (wanted('wall-close-corner')) {
    await stand(CORNER_X - 1, SEAWALL_FACE + 1, -0.6);
    await picture('wall-close-corner');
  }

  // grunts 3, 5 and 8 m ahead, with the camera's reticle on the nearest one and a burst in flight
  if (wanted('wall-close-shot')) {
    await stand(0, 120, 0);
    const g = game();
    g.enemies = [];
    for (const dist of CLOSE_DISTS) {
      const forward = { x: -Math.sin(g.mech.yaw), z: -Math.cos(g.mech.yaw) };
      const right = { x: Math.cos(g.mech.yaw), z: -Math.sin(g.mech.yaw) };
      g.enemies.push(
        newEnemy(
          `close-${dist}`,
          'test',
          'grunt',
          g.mech.x + right.x * CAMERA_TUNE.shoulder + forward.x * dist,
          g.mech.z + right.z * CAMERA_TUNE.shoulder + forward.z * dist,
          0,
        ),
      );
    }
    // hold the loop's own clock, then fire a few frames by hand so the tracers are in the air
    LOOP.maxDt = 0;
    const aim = aimRay({ x: g.mech.x, y: g.mech.y, z: g.mech.z, yaw: g.mech.yaw }, -0.18, CAMERA_TUNE);
    for (let i = 0; i < 2; i++) {
      step(g, { ...idle, fire: true, aim }, 1 / 60);
      await frame();
    }
    await picture('wall-close-shot');
  }
});
