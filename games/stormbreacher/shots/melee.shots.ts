// Screenshots of the mech's blow (SB-1755, SB-1756): the windup, the swing through and the return. The sortie's mech is
// the prototype (mechProtoModel.ts), so its free left arm throws the blow and the torso turns with it; the right arm keeps
// the cannon. The mech is drawn from its left side, where the swinging arm is. The blow on a nest is in
// melee-hit.shots.ts, in the sortie's own view. npm run shots. Not a test: it is not part of npm test or the CI (the
// drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the
// shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { camera, scene } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { lookOf } from '../src/data/looks.ts';
import { M1B_HAND } from '../src/data/maps/m1b-hand.ts';
import { meleeBlowSec, meleeHitSec, MELEE_TUNE } from '../src/data/melee.ts';
import { M1 } from '../src/data/missions/m1.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../src/view/field.ts';
import { applyLookTo } from '../src/view/look.ts';
import { animateProtoMech, buildProtoMech } from '../src/view/mechProtoModel.ts';
import { buildWorld } from '../src/view/world.ts';
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

test('melee', async () => {
  const map = M1B_HAND;
  for (const name of [GROUND_NAME, SIZE_BOX_NAME]) {
    const node = scene.getObjectByName(name);
    if (node) node.visible = false;
  }
  const world = buildWorld(map);
  applyLookTo(lookOf(M1.id), world.built.group);
  const model = buildProtoMech(MECH_TUNE.height, 'player');
  scene.add(model);
  model.position.set(0, 0, 166);
  model.rotation.y = 0;
  // from the rear left and a little above, so the free left arm (the one that throws the blow) stands against the sand
  look([-5.5, 3.2, 169], [0, 2, 165]);

  // Poses the mech at `t` seconds into a blow; the game is not run, so the clock is the sum of the constants.
  const pose = (t: number): void => {
    animateProtoMech(model, { speed: 0, grounded: true, boosting: false, landSpeed: null, fired: false, meleeT: t }, 0);
  };

  if (wanted('melee-windup')) {
    pose(MELEE_TUNE.windupSec * 0.7);
    await picture('melee-windup');
  }
  if (wanted('melee-swing')) {
    pose(meleeHitSec() - 0.03);
    await picture('melee-swing');
  }
  if (wanted('melee-return')) {
    pose(meleeBlowSec() - 0.06);
    await picture('melee-return');
  }
});
