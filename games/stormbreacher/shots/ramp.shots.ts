// Screenshots of the ramp up the seawall (SB-1390): from below its seaward end, looking up the slope, and from its
// side. npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ between machines).
// SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, systems } from '@engine/core/index.ts';
import { camera } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { sendToScript } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
const RAMP_X = 35; // the ramp the bot walks up (m)
const RAMP_Z = -56; // its middle (m)
const RAMP_Y = 3; // its middle's height (m)

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('ramp', async () => {
  startSortie();
  await frame();
  sendToScript(game(), { kind: 'skip' });
  const g = game();
  // the mech stands in the middle of the ramp, to show the slope's size
  g.mech.x = RAMP_X;
  g.mech.y = RAMP_Y;
  g.mech.z = RAMP_Z;
  g.mech.yaw = 0;
  g.mech.grounded = true;
  g.mech.vy = 0;
  // hold the game's step so its own camera does not take the view back
  LOOP.maxDt = 0;
  for (let i = 0; i < 4; i++) await frame();
  const play = systems.find(system => system.name === 'sb-play');
  if (play) play.enabled = false;

  const look = (x: number, y: number, z: number, atX: number, atY: number, atZ: number) => {
    camera.position.set(x, y, z);
    camera.lookAt(atX, atY, atZ);
  };

  if (wanted('ramp-below')) {
    look(RAMP_X, 1.4, -37, RAMP_X, 5.2, -64);
    await frame();
    await page.screenshot({ path: `${__SHOTS_OUT__}/ramp-below.png` });
  }
  if (wanted('ramp-side')) {
    look(RAMP_X + 16, 3.2, RAMP_Z, RAMP_X, RAMP_Y, RAMP_Z);
    await frame();
    await page.screenshot({ path: `${__SHOTS_OUT__}/ramp-side.png` });
  }
});
