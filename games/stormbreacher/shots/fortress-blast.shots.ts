// Screenshots of the fortress's charge and the blast (SB-1860): the charge in the land wall, its countdown on the HUD, the
// fortress going up seen from outside, and the ruin with the battery beyond. npm run shots. Not a test: it is not part of
// npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go;
// SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, systems } from '@engine/core/index.ts';
import { camera } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { boot } from '../src/app/boot.ts';
import { FORT_BLAST_TUNE } from '../src/data/fortress.ts';
import { fortressBlast, sendToScript } from '../src/logic/game.ts';
import { drawBooms, spawnBoom } from '../src/view/boom.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN =
  'body > *:not(#gl):not(#sbPlayHud) { visibility: hidden !important; } ' +
  '#sbPlayHud, #sbPlayHud * { visibility: visible !important; }'; // the 3D view and the HUD

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

// Holds the game still while the picture is taken, so the fuse or the cutscene's second is the one that was set up.
function freeze(): () => void {
  const maxDt = LOOP.maxDt;
  LOOP.maxDt = 0;
  return () => {
    LOOP.maxDt = maxDt;
  };
}

// Takes a picture from a camera of its own: the sortie's system is stopped for the moment (its state stays as it is), the
// dust is advanced by hand, and the loop draws our camera each frame.
async function ownCamera(
  name: string,
  pos: readonly [number, number, number],
  at: readonly [number, number, number],
  setup: () => void,
): Promise<void> {
  const play = systems.find(system => system.name === 'sb-play');
  const enabled = play?.enabled ?? false;
  if (play) play.enabled = false;
  await frame();
  setup();
  camera.position.set(...pos);
  camera.lookAt(...at);
  camera.updateProjectionMatrix();
  for (let i = 0; i < 8; i++) drawBooms(0.04);
  LOOP.draw = true;
  await picture(name);
  if (play) play.enabled = enabled;
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('fortress-blast', async () => {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);

  const g = game();
  g.mech.x = 0;
  g.mech.z = -114;
  g.mech.y = 0;
  g.mech.grounded = true;
  g.mech.yaw = 0;
  // the wall's magazine is open: the leader has called the way out, and the yard's waves are not what the pictures show
  sendToScript(g, { kind: 'wardenDown' });
  const quiet = (): void => {
    const current = game();
    current.enemies = [];
    current.assist = null;
    current.barrages = [];
    current.shells = [];
    current.fortressGun.wait = 1e9;
  };
  quiet();
  // the camera follows the mech with a lag, so it is given time to come round behind it
  for (let i = 0; i < 40; i++) {
    quiet();
    await frame();
  }

  if (wanted('fortress-blast-planted')) {
    const release = freeze();
    g.charges = [{ blast: 'fort-bomb', left: FORT_BLAST_TUNE.countdownSec, total: FORT_BLAST_TUNE.countdownSec }];
    quiet();
    await picture('fortress-blast-planted');
    release();
  }

  // the charge's place after the mid boss is down (SB-2047): the ring, the light and the door are looked at from the yard
  if (wanted('fortress-bomb-place')) {
    g.mech.z = -112;
    for (let i = 0; i < 40; i++) {
      quiet();
      await frame();
    }
    const bomb = g.blasts.find(blast => blast.id === 'fort-bomb');
    if (!bomb) throw new Error('the map has no fort-bomb');
    await ownCamera('fortress-bomb-place', [0, 7, bomb.z + 14], [0, 1, -124], () => quiet());
  }

  if (wanted('fortress-blast-countdown')) {
    g.mech.z = -100;
    for (let i = 0; i < 40; i++) {
      quiet();
      await frame();
    }
    const release = freeze();
    g.charges = [
      { blast: 'fort-bomb', left: FORT_BLAST_TUNE.countdownSec * 0.45, total: FORT_BLAST_TUNE.countdownSec },
    ];
    quiet();
    await picture('fortress-blast-countdown');
    release();
  }

  if (wanted('fortress-blast-burst')) {
    g.charges = [];
    g.mech.x = 0;
    g.mech.z = -58;
    for (let i = 0; i < 40; i++) {
      quiet();
      await frame();
    }
    await ownCamera('fortress-blast-burst', [0, 26, -40], [0, 2, -122], () => {
      for (const [x, z] of [
        [-30, -120],
        [0, -120],
        [30, -120],
        [-24, -71],
        [24, -71],
        [-12, -125],
        [12, -125],
        [0, -100],
        [-32, -100],
        [32, -100],
      ] as const) {
        spawnBoom('large', x, 0.8, z);
      }
    });
  }

  if (wanted('fortress-blast-ruins')) {
    g.script.cutscene = null;
    g.mech.x = 0;
    g.mech.z = -58;
    g.mech.yaw = 0;
    // the charge blows for real: the walls and the land door come down, and the fortress gun is wrecked
    const bomb = g.blasts.find(blast => blast.id === 'fort-bomb');
    if (!bomb) throw new Error('the map has no fort-bomb');
    g.charges = [];
    fortressBlast(g, bomb);
    sendToScript(g, { kind: 'skip' });
    g.script.cutscene = null;
    // the dust of the blast has time to thin before the picture
    for (let i = 0; i < 150; i++) {
      quiet();
      await frame();
    }
    await ownCamera('fortress-blast-ruins', [0, 18, -66], [0, 5, -235], () => {
      spawnBoom('large', 0, 0.8, -235);
      spawnBoom('large', 0, 0.8, -265);
    });
  }
});
