// Screenshots of the mech's shape (SB-1460): #view-mech's M1 from the front, the rear quarter and the side, and the
// sortie's own shoulder camera. npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ
// between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names
// contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { systems } from '@engine/core/index.ts';
import { camera, scene } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { sendToScript } from '../src/logic/game.ts';
import { disposeMech } from '../src/view/mechModel.ts';
import { showMech } from '../src/dev/views/mech.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set

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

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('mech', async () => {
  const params = new URLSearchParams(location.search);
  params.set('pattern', 'e');
  params.set('spin', '0');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}#view-mech`);

  // The view's own update moves the camera and the mech every frame; the pictures want the camera set by hand, so the
  // view's system is stopped after its first frame.
  const before = new Set(scene.children);
  showMech('#view-mech');
  const mech = scene.children.find(child => child.name === 'mech' && !before.has(child));
  if (!mech) throw new Error('#view-mech built no mech');
  const viewSystem = systems.find(system => system.name === 'sb-mech');
  if (viewSystem) viewSystem.enabled = false;

  const x = mech.position.x;
  const z = mech.position.z;
  const h = MECH_TUNE.height;
  const look = (px: number, py: number, pz: number) => {
    camera.position.set(x + px * h, py * h, z + pz * h);
    camera.lookAt(x, 0.5 * h, z);
  };

  try {
    if (wanted('mech-front')) {
      // the mech faces -z (data/mech.ts), so the camera is in front of the front plate
      look(0, 0.55, -2.2);
      await picture('mech-front');
    }
    if (wanted('mech-rear')) {
      look(1.5, 0.65, 1.8);
      await picture('mech-rear');
    }
    if (wanted('mech-side')) {
      look(2.2, 0.55, 0);
      await picture('mech-side');
    }
  } finally {
    // the dev view's map, mech and bars come out, so the sortie below is alone in the scene
    for (const child of scene.children.filter(child => !before.has(child))) scene.remove(child);
    disposeMech(mech);
    document.getElementById('sbMechBar')?.remove();
    document.getElementById('sbTunePanel')?.remove();
  }

  if (wanted('mech-shoulder')) {
    startSortie();
    await until(() => game().script.cutscene !== null);
    sendToScript(game(), { kind: 'skip' });
    await until(() => game().script.cutscene === null);
    await picture('mech-shoulder');
  }
});
