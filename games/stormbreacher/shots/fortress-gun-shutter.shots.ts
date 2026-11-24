// Screenshots of the fortress nest's plate (SB-2051): shut seen from near line 2 and from the open ground before the sea
// gate, rolling up, and open with the nest up. npm run shots. Not a test: it is not part of npm test or the CI (the drawn
// pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots
// whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { camera, scene } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { FORTRESS_SHUTTER_TUNE } from '../src/data/fortress.ts';
import { lookOf } from '../src/data/looks.ts';
import { M1B_HAND } from '../src/data/maps/m1b-hand.ts';
import { M1 } from '../src/data/missions/m1.ts';
import { newGame } from '../src/logic/game.ts';
import { applyLookTo } from '../src/view/look.ts';
import { buildWorld, syncWorld } from '../src/view/world.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../src/view/field.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN = 'body > *:not(#gl) { visibility: hidden !important; }'; // the 3D view only
const NEST = 'fortress-gun';

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

async function picture(name: string): Promise<void> {
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

function look(pos: readonly [number, number, number], at: readonly [number, number, number]): void {
  camera.position.set(...pos);
  camera.lookAt(...at);
  camera.updateProjectionMatrix();
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('fortress-gun-shutter', async () => {
  const map = M1B_HAND;
  for (const name of [GROUND_NAME, SIZE_BOX_NAME]) {
    const node = scene.getObjectByName(name);
    if (node) node.visible = false;
  }
  const world = buildWorld(map);
  applyLookTo(lookOf(M1.id), world.built.group);
  const game = newGame(map);
  const shutter = game.shutters.find(item => item.target === NEST);
  if (!shutter) throw new Error('the hand map has no shutter for the nest');
  syncWorld(world, game, 0);

  if (wanted('shutter-closed-far')) {
    // from near line 2, about where the mech fights the pillboxes: the wall and the shut nest far ahead
    look([14, 9, -22], [20, 10, -70]);
    await picture('shutter-closed-far');
  }

  if (wanted('shutter-closed-near')) {
    // from the open ground before the sea gate, the plate shut in front of the nest
    look([14, 7, -50], [20, 10, -70]);
    await picture('shutter-closed-near');
  }

  // the flag stands: one frame sees it open, then the plate rolls up over openSec
  shutter.open = true;
  if (wanted('shutter-opening')) {
    syncWorld(world, game, FORTRESS_SHUTTER_TUNE.openSec * 0.45);
    look([14, 7, -50], [20, 10, -70]);
    await picture('shutter-opening');
  }

  if (wanted('shutter-open')) {
    syncWorld(world, game, FORTRESS_SHUTTER_TUNE.openSec);
    look([14, 7, -50], [20, 10, -70]);
    await picture('shutter-open');
  }
});
