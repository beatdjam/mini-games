// Screenshot of the mech's fist landing on a machine-gun nest (SB-1755): the real sortie is run by hand to the frame the
// blow lands, then the camera is put at the mech's side for the picture. npm run shots. Not a test: it is not part of
// npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the picture goes;
// SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { LOOP, runSystems, systems } from '@engine/core/index.ts';
import { camera } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { meleeHitSec } from '../src/data/melee.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { newEnemy } from '../src/logic/enemies.ts';
import { sendToScript, type GameModel } from '../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

function game(): GameModel {
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

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('melee-hit', async () => {
  if (!wanted('melee-hit')) return;
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);

  // The mech stands on the beach facing the land; the nest is close ahead and a little to its left, so the left-side
  // camera sees the free arm's swing and the near face where the blow lands.
  const x = 0;
  const z = 166;
  const nest = newEnemy('melee-shot', 'test', 'emplacement', x - 1.8, z - 2.6);
  const hold = (): void => {
    const current = game();
    current.mech.x = x;
    current.mech.z = z;
    current.mech.y = 0;
    current.mech.grounded = true;
    current.mech.yaw = 0;
    current.armor = MECH_TUNE.armor;
    current.enemies = [nest];
    current.allies = [];
    current.barrages = [];
    current.shells = [];
  };
  hold();
  // the camera comes round behind the mech while the game is run by hand, so the drawn frames do not move it
  LOOP.maxDt = 0;
  for (let i = 0; i < 40; i++) {
    hold();
    runSystems(1 / 60);
  }

  // Q starts the blow; the strike frame is the one the game's own clock names.
  hold();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true }));
  let elapsed = 0;
  while (!(game().melee.blow?.struck === true) && elapsed < 40) {
    hold();
    runSystems(1 / 60);
    elapsed++;
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ', bubbles: true }));
  if (game().melee.blow?.struck !== true) throw new Error(`the blow did not land within ${elapsed} frames`);
  if (elapsed * (1 / 60) < meleeHitSec()) throw new Error('the blow landed before the swing');
  const blow = game().events.find(event => event.kind === 'melee');
  if (blow === undefined || blow.kind !== 'melee' || !blow.hit) throw new Error('the blow met nothing');
  if (blow.z < 164.8 || blow.z > 164.9) throw new Error(`the blow landed at z ${blow.z}, not on the nest's face`);

  // The side camera is set after the frame is drawn, and the same frame is drawn again with it. The sortie's own system
  // is held off and the clock stopped, so a drawn frame cannot put the camera back behind the mech or age the sparks.
  const play = systems.find(system => system.name === 'sb-play');
  if (play) play.enabled = false;
  LOOP.maxDt = 0;
  camera.position.set(-9, 3.6, 165.8);
  camera.lookAt(-0.5, 2, 164);
  camera.updateProjectionMatrix();
  LOOP.render?.();
  await page.screenshot({ path: `${__SHOTS_OUT__}/melee-hit.png` });
  if (play) play.enabled = true;
  LOOP.maxDt = 0.05;
});
