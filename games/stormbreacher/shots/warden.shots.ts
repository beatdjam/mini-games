// Screenshots of the heavy command mech (SB-1850): it comes out of the land gate, warns of a burst, shows the red band
// of a charge, stands exposed after the run and falls in smoke. npm run shots. Not a test: it is not part of npm test or
// the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text>
// takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { camera, scene } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { lookOf } from '../src/data/looks.ts';
import { M1B_HAND } from '../src/data/maps/m1b-hand.ts';
import { M1_MECH, M1_MECH_PALETTE, M1_WEAPON_SCALE } from '../src/data/mech.ts';
import { M1 } from '../src/data/missions/m1.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { WARDEN_TUNE } from '../src/data/warden.ts';
import { newEnemy } from '../src/logic/enemies.ts';
import { newGame } from '../src/logic/game.ts';
import { buildBooms, drawBooms, spawnBoom } from '../src/view/boom.ts';
import { buildEnemyView, drawEnemies } from '../src/view/enemies.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../src/view/field.ts';
import { applyLookTo } from '../src/view/look.ts';
import { buildMechVisual } from '../src/view/mechModel.ts';
import { buildWardenChargeView, drawWardenCharge } from '../src/view/play.ts';
import { buildWorld } from '../src/view/world.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN = 'body > *:not(#gl) { visibility: hidden !important; }'; // the 3D view only

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

test('warden', async () => {
  const map = M1B_HAND;
  for (const name of [GROUND_NAME, SIZE_BOX_NAME]) {
    const node = scene.getObjectByName(name);
    if (node) node.visible = false;
  }
  const world = buildWorld(map);
  applyLookTo(lookOf(M1.id), world.built.group);
  buildBooms(map.bounds);

  const game = newGame(map);
  game.mech.x = 0;
  game.mech.y = 0;
  game.mech.z = -95;
  game.mech.grounded = true;
  game.mech.yaw = 0;
  const model = buildMechVisual(
    { build: M1_MECH, palette: M1_MECH_PALETTE, weaponScale: M1_WEAPON_SCALE },
    MECH_TUNE.height,
  );
  model.position.set(game.mech.x, game.mech.y, game.mech.z);
  scene.add(model);
  const enemyView = buildEnemyView();
  const chargeView = buildWardenChargeView();

  const warden = newEnemy('warden-1', 'warden', 'warden', 0, -118);
  if (!warden.warden) throw new Error('the warden has no state');
  game.enemies = [warden];

  if (wanted('warden-appear')) {
    look([18, 9, -92], [0, 4, -118]);
    drawEnemies(enemyView, game);
    drawWardenCharge(chargeView, game);
    await picture('warden-appear');
  }

  if (wanted('warden-burst-telegraph')) {
    warden.warden.phase = 'burst';
    warden.warden.burstLeft = WARDEN_TUNE.burst.shots;
    warden.warden.timer = WARDEN_TUNE.burstTelegraph;
    look([14, 8, -98], [0, 4, -118]);
    drawEnemies(enemyView, game);
    drawWardenCharge(chargeView, game);
    await picture('warden-burst-telegraph');
  }

  if (wanted('warden-charge-band')) {
    warden.warden.phase = 'charge';
    warden.warden.timer = WARDEN_TUNE.charge.telegraph;
    warden.warden.chargeLeft = WARDEN_TUNE.charge.distance;
    look([22, 12, -88], [0, 2, -108]);
    drawEnemies(enemyView, game);
    drawWardenCharge(chargeView, game);
    await picture('warden-charge-band');
  }

  if (wanted('warden-exposed')) {
    warden.warden.phase = 'stagger';
    warden.warden.timer = WARDEN_TUNE.charge.stagger;
    warden.warden.exposed = WARDEN_TUNE.charge.stagger;
    warden.yaw = Math.PI;
    // from behind: the radiator plate on its back faces this camera
    look([0, 8, -132], [0, 3, -114]);
    drawEnemies(enemyView, game);
    drawWardenCharge(chargeView, game);
    await picture('warden-exposed');
  }

  if (wanted('warden-down')) {
    warden.hp = 0;
    warden.warden.phase = 'dying';
    warden.warden.dying = WARDEN_TUNE.dieSec - 0.5;
    for (let i = 0; i < 5; i++) {
      spawnBoom('small', warden.x + (i - 2) * 1.2, 1.4 + (i % 2) * 1.5, warden.z + (i % 3) * 1.1);
    }
    drawBooms(0.35);
    look([20, 10, -96], [0, 2, -116]);
    drawEnemies(enemyView, game);
    drawWardenCharge(chargeView, game);
    await picture('warden-down');
  }
});
