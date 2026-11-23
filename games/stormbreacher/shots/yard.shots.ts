// Screenshots of the fortress's yard (SB-1840): the mech going in, the three waves shutting it in, the survivors' tracer
// from above the sea gate and the yard cleared. npm run shots. Not a test: it is not part of npm test or the CI (the
// drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only
// the shots whose names contain it.
import * as THREE from 'three';
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { distXZ } from '@engine/core/index.ts';
import { camera, scene } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { M1_WAVE_DROP, M1_WAVE_ENEMY } from '../src/data/enemies.ts';
import { YARD_TUNE } from '../src/data/fortress.ts';
import { lookOf } from '../src/data/looks.ts';
import { M1B_HAND } from '../src/data/maps/m1b-hand.ts';
import { M1_MECH, M1_MECH_PALETTE, M1_WEAPON_SCALE } from '../src/data/mech.ts';
import { M1 } from '../src/data/missions/m1.ts';
import { MECH_TUNE, PLAY_BATTLE_TUNE } from '../src/data/tune.ts';
import { newAlly } from '../src/logic/allies.ts';
import { newEnemy, type EnemyState } from '../src/logic/enemies.ts';
import { newGame } from '../src/logic/game.ts';
import { seed, stream } from '../src/logic/rng.ts';
import { buildAllyView, drawAllies } from '../src/view/allies.ts';
import { buildBattle } from '../src/view/battle/index.ts';
import { buildEnemyView, drawEnemies } from '../src/view/enemies.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../src/view/field.ts';
import { applyLookTo } from '../src/view/look.ts';
import { buildMechVisual } from '../src/view/mechModel.ts';
import { buildWorld } from '../src/view/world.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN = 'body > *:not(#gl) { visibility: hidden !important; }'; // the 3D view only
const TRACER_COLOR = 0xfff1a8; // the survivors' tracer, a paler line than the battlefield's
const COVERS = ['cover-b1', 'cover-b2', 'cover-b3'] as const;

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

// One enemy at each of the map's places for the wave, as spawnWave in logic/game.ts puts them out.
function waveEnemies(waves: readonly string[]): EnemyState[] {
  return waves.flatMap(wave => {
    const places = M1B_HAND.spawns[wave] ?? [];
    const kinds = M1_WAVE_ENEMY[wave] ?? [];
    const y = M1_WAVE_DROP[wave] ?? 0;
    return places.map((place, i) => newEnemy(`${wave}-${i + 1}`, wave, kinds[i] ?? 'grunt', place.x, place.z, y));
  });
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('yard', async () => {
  const map = M1B_HAND;
  for (const name of [GROUND_NAME, SIZE_BOX_NAME]) {
    const node = scene.getObjectByName(name);
    if (node) node.visible = false;
  }
  const world = buildWorld(map);
  applyLookTo(lookOf(M1.id), world.built.group);

  seed(7);
  const game = newGame(map);
  game.mech.y = 0;
  game.mech.grounded = true;
  game.mech.yaw = 0;
  const model = buildMechVisual(
    { build: M1_MECH, palette: M1_MECH_PALETTE, weaponScale: M1_WEAPON_SCALE },
    MECH_TUNE.height,
  );
  scene.add(model);
  const enemyView = buildEnemyView();
  const allyView = buildAllyView();
  const battle = buildBattle(map, PLAY_BATTLE_TUNE, stream('battle'), stream('craters'), { x: 0, z: -92 }, null);
  const tracers = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: TRACER_COLOR }),
  );
  tracers.frustumCulled = false;
  scene.add(tracers);

  // the survivors at their post just inside the sea gate, facing into the yard
  game.allies = COVERS.map((id, i) => {
    const ally = newAlly(id, M1.paths['yard-cover'], null);
    ally.x = -4 + i * 4;
    ally.z = -75;
    ally.y = 0;
    ally.yaw = 0;
    ally.next = ally.way.length;
    return ally;
  });

  const showMech = (x: number, z: number): void => {
    game.mech.x = x;
    game.mech.z = z;
    model.position.set(game.mech.x, game.mech.y, game.mech.z);
    model.rotation.y = game.mech.yaw;
  };

  if (wanted('yard-in')) {
    // in the gate: the yard opens ahead, its cover and the far wall, nothing out yet
    game.enemies = [];
    showMech(0, -78);
    drawEnemies(enemyView, game);
    drawAllies(allyView, game, battle, stream('allyFx'), 0);
    look([20, 10, -108], [0, 2, -77]);
    await picture('yard-in');
  }

  if (wanted('yard-surrounded')) {
    // the three waves out: the left and right doors, the back of the yard and the two beside the gate
    game.enemies = waveEnemies(['yard-1', 'yard-2', 'yard-3']);
    showMech(0, -92);
    drawEnemies(enemyView, game);
    drawAllies(allyView, game, battle, stream('allyFx'), 0);
    look([0, 22, -60], [0, 1, -100]);
    await picture('yard-surrounded');
  }

  if (wanted('yard-assist')) {
    // the survivors' shot: one line from above the sea gate to the enemy nearest it
    game.enemies = waveEnemies(['yard-1', 'yard-2']);
    showMech(0, -90);
    drawEnemies(enemyView, game);
    drawAllies(allyView, game, battle, stream('allyFx'), 0);
    const nearest = game.enemies.reduce((best, enemy) =>
      distXZ(YARD_TUNE.gate, enemy) < distXZ(YARD_TUNE.gate, best) ? enemy : best,
    );
    tracers.geometry.setFromPoints([
      new THREE.Vector3(YARD_TUNE.gate.x, YARD_TUNE.gateY, YARD_TUNE.gate.z),
      new THREE.Vector3(nearest.x, 1.6, nearest.z),
    ]);
    look([0, 14, -55], [0, 1.5, -95]);
    await picture('yard-assist');
  }

  if (wanted('yard-clear')) {
    // the yard empty, the survivors still at the gate
    game.enemies = [];
    tracers.geometry.setFromPoints([]);
    showMech(0, -96);
    drawEnemies(enemyView, game);
    drawAllies(allyView, game, battle, stream('allyFx'), 0);
    look([0, 10, -52], [0, 2, -100]);
    await picture('yard-clear');
  }
});
