// Screenshot of the mech's blow in #view-mech (SB-1756): the prototype's free left arm throws it, so the view's own
// "殴る" action (key Q) is played, the picture taken on the frame the blow lands, and the camera put at the mech's left
// so the arm's swing shows. npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ
// between machines). SHOTS_OUT=<folder> picks where the picture goes; SHOTS_ONLY=<text> takes only the shots whose names
// contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems, systems } from '@engine/core/index.ts';
import { camera, scene } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { meleeHitSec } from '../src/data/melee.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { showMech } from '../src/dev/views/mech.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

async function picture(name: string): Promise<void> {
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  // main.ts imports the dev views after boot; wait for that import, so a view does not open late and move the camera
  await import('../src/dev/dev.ts');
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('melee-view', async () => {
  if (!wanted('melee-view')) return;
  const params = new URLSearchParams(location.search);
  params.set('kit', 'player');
  params.set('spin', '0');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}#view-mech`);
  showMech('#view-mech');

  // The view's own system runs the action; the page's loop is stilled so each frame is exactly 1/60 s of it.
  LOOP.maxDt = 0;
  for (let i = 0; i < DRAWN_FRAMES; i++) runSystems(1 / 60);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
  const frames = Math.ceil(meleeHitSec() * 60) + 1;
  for (let i = 0; i < frames; i++) runSystems(1 / 60);
  // The mech's left front: the free arm is the near one. The views' systems move the camera every frame, so they are
  // stopped while the picture is taken.
  for (const system of systems) system.enabled = false;
  const proto = scene.children.find(child => child.name === 'mech-proto');
  if (!proto) throw new Error('#view-mech?kit=player built no prototype');
  const height = MECH_TUNE.height;
  const at = { x: proto.position.x, z: proto.position.z };
  camera.position.set(at.x - height, height * 0.65, at.z - height * 0.9);
  camera.lookAt(at.x, height * 0.55, at.z);
  await picture('melee-view');
  LOOP.maxDt = 0.05;
});
