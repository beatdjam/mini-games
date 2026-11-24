// The fortress's walls, the sea-wall nest and its shutter (SB-2052): the wall from outside (near line 2 and before the
// gate), from the yard, the nest with its plate shut, rolling up and open, and the wall with a mass-produced mech and a
// pillbox beside it, to judge the density against each other. npm run shots. Not a test: it is not part of npm test or
// the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text>
// takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { camera, scene } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { FORTRESS_SHUTTER_TUNE } from '../src/data/fortress.ts';
import { lookOf } from '../src/data/looks.ts';
import { M1B_HAND } from '../src/data/maps/m1b-hand.ts';
import { M1 } from '../src/data/missions/m1.ts';
import { newEnemy } from '../src/logic/enemies.ts';
import { newGame } from '../src/logic/game.ts';
import { buildEnemyView, drawEnemies } from '../src/view/enemies.ts';
import { applyLookTo } from '../src/view/look.ts';
import { buildTargets } from '../src/view/outdoor.ts';
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

test('fortress-detail', async () => {
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

  if (wanted('wall-far')) {
    // from near line 2, about where the mech fights the pillboxes
    look([14, 9, -22], [20, 10, -70]);
    await picture('wall-far');
  }
  if (wanted('wall-gate')) {
    // before the sea gate, the wall either side
    look([0, 6, -46], [-8, 7, -71]);
    await picture('wall-gate');
  }
  if (wanted('wall-near')) {
    // close under the wall, the side of the gate
    look([-26, 4, -58], [-26, 6, -71]);
    await picture('wall-near');
  }
  if (wanted('wall-yard')) {
    // from the yard: the sea wall's inner face and the side wall
    look([14, 5, -96], [-10, 6, -71]);
    await picture('wall-yard');
  }
  if (wanted('wall-top')) {
    // the wall's top and its parapet, from above and beside
    look([40, 16, -50], [26, 10, -71]);
    await picture('wall-top');
  }
  if (wanted('nest-far')) {
    look([14, 9, -22], [20, 10, -70]);
    await picture('nest-far');
  }
  if (wanted('nest-closed')) {
    look([14, 7, -50], [20, 10, -70]);
    await picture('nest-closed');
  }
  if (wanted('nest-closed-near')) {
    look([14, 8, -62], [20, 9, -71]);
    await picture('nest-closed-near');
  }
  if (wanted('nest-closed-front')) {
    // the plate square on, from above the gate's height
    look([20, 17, -46], [20, 17, -71]);
    await picture('nest-closed-front');
  }
  shutter.open = true;
  if (wanted('nest-opening')) {
    syncWorld(world, game, FORTRESS_SHUTTER_TUNE.openSec * 0.45);
    look([14, 7, -50], [20, 10, -70]);
    await picture('nest-opening');
  }
  syncWorld(world, game, FORTRESS_SHUTTER_TUNE.openSec);
  if (wanted('nest-open')) {
    look([14, 7, -50], [20, 10, -70]);
    await picture('nest-open');
  }
  if (wanted('nest-open-front')) {
    // the nest square on from the open ground, its guns toward the camera
    look([20, 19, -48], [20, 17, -71]);
    await picture('nest-open-front');
  }
  if (wanted('nest-open-close')) {
    look([13, 19, -58], [20.5, 18, -69]);
    await picture('nest-open-close');
  }
  if (wanted('nest-open-side')) {
    look([36, 21, -57], [20, 17, -70]);
    await picture('nest-open-side');
  }
  if (wanted('nest-open-yard')) {
    // from the yard: the nest's back, the hood and the ladder
    look([26, 19, -86], [20, 17, -72]);
    await picture('nest-open-yard');
  }

  if (wanted('with-grunt')) {
    // a mass-produced mech and a pillbox before the wall, the nest open above: the densities side by side
    const targets = buildTargets([{ id: 'shot-pillbox', kind: 'pillbox', x: -10, z: -60, yaw: 0 }]);
    scene.add(targets);
    const enemies = buildEnemyView();
    const grunt = newEnemy('shot-grunt', 'shot', 'grunt', 1, -57);
    grunt.dormant = true;
    grunt.yaw = Math.PI;
    game.enemies = [grunt];
    look([-4, 5, -42], [-4, 7, -70]);
    drawEnemies(enemies, game);
    await picture('with-grunt');
    look([-2, 3.5, -49], [-5, 6, -68]);
    drawEnemies(enemies, game);
    await picture('with-grunt-close');
    scene.remove(targets);
  }
});
