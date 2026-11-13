// Screenshots of the six machine-gun nests of B (SB-1520): the nests' burst across line 1, the mech behind the line's
// hedgehogs (no shot gets through), and one nest put down. npm run shots. Not a test: it is not part of npm test or the CI
// (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes
// only the shots whose names contain it.
import * as THREE from 'three';
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { camera, scene } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { ENEMY_BULLET_COLOR } from '../src/data/colors.ts';
import { lookOf } from '../src/data/looks.ts';
import { M1B_HAND } from '../src/data/maps/m1b-hand.ts';
import { M1_MECH, M1_MECH_PALETTE, M1_WEAPON_SCALE } from '../src/data/mech.ts';
import { M1 } from '../src/data/missions/m1.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { newEnemy, stepEnemy, type EnemyShot } from '../src/logic/enemies.ts';
import { newGame } from '../src/logic/game.ts';
import { stream } from '../src/logic/rng.ts';
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
const DT = 1 / 60;
const BURST_SECONDS = 3.8; // long enough for the first burst of every nest that can see
const TRACER_LENGTH = 4; // as long as the game draws an enemy's tracer (m)
const MAX_TRACERS = 64;

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

// The nests' tracers: one line per shot fired in the staging run, drawn from the muzzle along the shot's way.
function buildTracers(): { lines: THREE.LineSegments; positions: THREE.BufferAttribute } {
  const positions = new THREE.BufferAttribute(new Float32Array(MAX_TRACERS * 2 * 3), 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positions);
  geometry.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: ENEMY_BULLET_COLOR }));
  lines.frustumCulled = false;
  scene.add(lines);
  return { lines, positions };
}

test('emplacement', async () => {
  const map = M1B_HAND;
  for (const name of [GROUND_NAME, SIZE_BOX_NAME]) {
    const node = scene.getObjectByName(name);
    if (node) node.visible = false;
  }
  const world = buildWorld(map);
  applyLookTo(lookOf(M1.id), world.built.group);
  const game = newGame(map);
  const model = buildMechVisual(
    { build: M1_MECH, palette: M1_MECH_PALETTE, weaponScale: M1_WEAPON_SCALE },
    MECH_TUNE.height,
  );
  scene.add(model);
  const enemyView = buildEnemyView();
  const tracers = buildTracers();

  // Puts the mech at (x, z), brings the six nests up fresh and runs the burst the nests can take from there.
  const stage = (x: number, z: number): EnemyShot[] => {
    game.mech.x = x;
    game.mech.z = z;
    game.mech.y = 0;
    model.position.set(x, 0, z);
    const places = map.spawns['b-emplacements'];
    game.enemies = places.map((place, i) =>
      newEnemy(`b-emplacements-${i + 1}`, 'b-emplacements', 'emplacement', place.x, place.z),
    );
    const enemyWorld = {
      rects: game.rects,
      propBoxes: game.propBoxes,
      bounds: map.bounds,
      nav: null,
      others: game.enemies,
    };
    const shots: EnemyShot[] = [];
    for (let i = 0; i < Math.round(BURST_SECONDS / DT); i++) {
      for (const nest of game.enemies) {
        const shot = stepEnemy(nest, game.mech, enemyWorld, DT, stream('emplacements'));
        if (shot) shots.push(shot);
      }
    }
    drawEnemies(enemyView, game);
    return shots;
  };

  const drawTracers = (shots: readonly EnemyShot[]): void => {
    const count = Math.min(shots.length, MAX_TRACERS);
    for (let i = 0; i < count; i++) {
      const shot = shots[i];
      tracers.positions.setXYZ(i * 2, shot.x, shot.y, shot.z);
      tracers.positions.setXYZ(
        i * 2 + 1,
        shot.x + shot.dx * TRACER_LENGTH,
        shot.y + shot.dy * TRACER_LENGTH,
        shot.z + shot.dz * TRACER_LENGTH,
      );
    }
    tracers.positions.needsUpdate = true;
    tracers.lines.geometry.setDrawRange(0, count * 2);
  };

  if (wanted('emplacement-burst')) {
    // in front of line 1: its two nests sweep across the mech; the other four stand behind the line's hedgehogs
    const shots = stage(40, 150);
    drawTracers(shots);
    look([12, 12, 170], [8, 1.2, 143]);
    await picture('emplacement-burst');
  }

  if (wanted('emplacement-cover')) {
    // the mech just landward of line 1: the hedgehogs stand between it and the line's nests, so no shot gets through
    const shots = stage(40, 136);
    drawTracers(shots);
    look([40, 4, 128], [40, 1.2, 146]);
    await picture('emplacement-cover');
  }

  if (wanted('emplacement-down')) {
    // the right nest of line 1 put down; it is drawn low and dark
    const shots = stage(40, 150);
    const down = game.enemies[1];
    if (down) down.hp = 0;
    drawEnemies(enemyView, game);
    drawTracers(shots);
    look([45, 3.5, 156], [45, 0.8, 146]);
    await picture('emplacement-down');
  }
});
