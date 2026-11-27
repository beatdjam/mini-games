// Screenshots of the camera at a wall the mech backs into while looking down (SB-2040): straight back, and diagonally. The
// frames near the wall are drawn, and the screen's facing is measured on the way (the angle off the aim is in the name).
// npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ between machines).
// SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { currentGame, currentPlayView, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { CAMERA_TUNE } from '../src/data/tune.ts';
import { sendToScript } from '../src/logic/game.ts';
import { aimRay } from '../src/view/camera.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
const SETTLE = 60; // frames the camera gets to come to its place (at 60 fps, one second)
const RUN = 40; // frames the mech backs for
const BACK_SPEED = 25; // m/s, the boost's speed
const WATCH = 3; // m from the wall's face at which the run starts to be drawn
const SEAWALL_X = 20; // a piece of the seawall's middle (m)
const SEAWALL_FACE = -65; // the seawall's near face on +z (m)

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

// The angle between the screen's middle line and the mech's aim (deg), on the state the view drew.
function offAim(): number {
  const view = currentPlayView();
  // @ts-expect-error the quarter camera has no third-person state (ticket 2135 rewrites this shot)
  if (!view?.cam) throw new Error('the sortie has no view');
  // @ts-expect-error the quarter camera has no third-person state (ticket 2135 rewrites this shot)
  const ray = aimRay(view.cam);
  const turn = Math.atan2(-ray.dx, -ray.dz) - game().mech.yaw;
  return Math.abs((Math.atan2(Math.sin(turn), Math.cos(turn)) * 180) / Math.PI);
}

// Puts the mech 6 m in front of the seawall facing away from it, the camera looking down, then backs it toward the wall at
// the boost's speed (`side` m/s sideways too). Once it is within WATCH m of the wall, every other frame is drawn, and the
// picture's name carries the frame, the mech's distance from the wall and the angle off the aim at that frame (deg).
async function backInto(name: string, side: number): Promise<void> {
  const g = game();
  const view = currentPlayView();
  if (!view) throw new Error('the sortie has no view');
  g.mech.x = SEAWALL_X;
  g.mech.z = SEAWALL_FACE + 6;
  g.mech.yaw = Math.PI; // yaw 0 faces -z, so a half turn points away from the wall at -z
  g.mech.vx = 0;
  g.mech.vz = 0;
  view.pitch = CAMERA_TUNE.pitchMin;
  for (let n = 0; n < SETTLE; n++) await frame();
  for (let n = 0; n < RUN; n++) {
    // backing is toward -z while the mech faces +z
    g.mech.vz = -BACK_SPEED;
    g.mech.vx = side;
    await frame();
    const away = g.mech.z - SEAWALL_FACE;
    if (away < WATCH && n % 2 === 0) {
      const off = offAim().toFixed(0);
      await page.screenshot({ path: `${__SHOTS_OUT__}/${name}-f${n}-away${away.toFixed(1)}-off${off}.png` });
    }
  }
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('wall-yaw', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);

  if (wanted('wall-yaw-back')) await backInto('wall-yaw-back', 0);
  if (wanted('wall-yaw-diagonal')) await backInto('wall-yaw-diagonal', 12);
});
