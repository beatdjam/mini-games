// Screenshots of the pillboxes' blast points (SB-1540): the ring beside pillbox-1 and the ring behind it, each with the
// mech standing 4 m off facing the point, so the ring is the picture's subject. npm run shots. Not a test: it is not part
// of npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go;
// SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { sendToScript } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const CAMERA_FRAMES = 40; // frames the camera takes to come round behind the mech
const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

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

// No mortar shells while the camera settles: the beach cue starts the barrage, and a landing would cover the ring.
function quiet(): void {
  const current = game();
  current.barrages = [];
  current.shells = [];
}

// Stands the mech `dz` metres from the point, facing `yaw` (0 is the land), and lets the camera come round behind it.
async function standAt(pointId: string, dz: number, yaw: number): Promise<void> {
  const current = game();
  const point = current.blasts.find(place => place.id === pointId);
  if (!point) throw new Error(`the map has no ${pointId}`);
  current.mech.x = point.x;
  current.mech.z = point.z + dz;
  current.mech.y = 0;
  current.mech.grounded = true;
  current.mech.yaw = yaw;
  for (let i = 0; i < CAMERA_FRAMES; i++) {
    quiet();
    await frame();
  }
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('blast', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);

  // the side point is watched from the sea, the back point from the land
  if (wanted('blast-pillbox-side')) {
    await standAt('blast-pillbox-1-side', 4, 0);
    await picture('blast-pillbox-side');
  }
  if (wanted('blast-pillbox-back')) {
    await standAt('blast-pillbox-1-back', -4, Math.PI);
    await picture('blast-pillbox-back');
  }
});
