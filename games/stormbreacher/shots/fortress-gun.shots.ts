// Screenshots of the fortress's sea-wall nest (SB-1830): the gun on the wall seen from the open ground, its sweep, the
// mech behind the wreck's shadow, and its flash and line out to sea. npm run shots. Not a test: it is not part of npm
// test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go;
// SHOTS_ONLY=<text> takes only the shots whose names contain it.
import * as THREE from 'three';
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { camera, scene } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { ENEMY_BULLET_COLOR } from '../src/data/colors.ts';
import { FORTRESS_GUN_TUNE } from '../src/data/fortress.ts';
import { lookOf } from '../src/data/looks.ts';
import { M1B_HAND } from '../src/data/maps/m1b-hand.ts';
import { M1_MECH, M1_MECH_PALETTE, M1_WEAPON_SCALE } from '../src/data/mech.ts';
import { M1 } from '../src/data/missions/m1.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { newFortressGun, stepFortressGun } from '../src/logic/fortress.ts';
import { newGame } from '../src/logic/game.ts';
import { seed, stream } from '../src/logic/rng.ts';
import type { EnemyShot } from '../src/logic/enemies.ts';
import { buildMechVisual } from '../src/view/mechModel.ts';
import { applyLookTo } from '../src/view/look.ts';
import { buildSeaFire, drawSeaFire } from '../src/view/seaFire.ts';
import { buildWorld } from '../src/view/world.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../src/view/field.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN = 'body > *:not(#gl) { visibility: hidden !important; }'; // the 3D view only
const TRACER_LENGTH = 6; // how long a shot's line is drawn here (m)
const MAX_TRACERS = 32;

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

function drawTracers(view: ReturnType<typeof buildTracers>, shots: readonly EnemyShot[]): void {
  const count = Math.min(shots.length, MAX_TRACERS);
  for (let i = 0; i < count; i++) {
    const shot = shots[i];
    view.positions.setXYZ(i * 2, shot.x, shot.y, shot.z);
    view.positions.setXYZ(
      i * 2 + 1,
      shot.x + shot.dx * TRACER_LENGTH,
      shot.y + shot.dy * TRACER_LENGTH,
      shot.z + shot.dz * TRACER_LENGTH,
    );
  }
  view.positions.needsUpdate = true;
  view.lines.geometry.setDrawRange(0, count * 2);
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('fortress-gun', async () => {
  const map = M1B_HAND;
  for (const name of [GROUND_NAME, SIZE_BOX_NAME]) {
    const node = scene.getObjectByName(name);
    if (node) node.visible = false;
  }
  const world = buildWorld(map);
  applyLookTo(lookOf(M1.id), world.built.group);
  const game = newGame(map);
  game.mech.x = 0;
  game.mech.z = -58;
  game.mech.y = 0;
  const gun = game.targets.find(target => target.id === 'fortress-gun');
  if (!gun) throw new Error('the hand map has no fortress-gun');
  const blockers = game.propBoxes;

  const model = buildMechVisual(
    { build: M1_MECH, palette: M1_MECH_PALETTE, weaponScale: M1_WEAPON_SCALE },
    MECH_TUNE.height,
  );
  scene.add(model);
  const tracers = buildTracers();
  const seaFire = buildSeaFire(game);

  if (wanted('fortress-gun-wall')) {
    // from the open ground: the nest on the wall's top, the gate below and the cover either side
    model.visible = false;
    look([0, 7, -40], [14, 11, -69]);
    await picture('fortress-gun-wall');
  }

  if (wanted('fortress-gun-sweep')) {
    // the burst's eight shots, drawn from the muzzle across the open ground
    model.visible = true;
    model.position.set(game.mech.x, game.mech.y, game.mech.z);
    seed(7);
    const state = newFortressGun();
    state.wait = 0;
    const shots: EnemyShot[] = [];
    const seconds = FORTRESS_GUN_TUNE.interval * (FORTRESS_GUN_TUNE.shots - 1) + 0.1;
    for (let i = 0; i < Math.round(seconds / (1 / 60)); i++) {
      const shot = stepFortressGun(state, gun.box, game.mech, blockers, 1 / 60, stream('battery'));
      if (shot) shots.push(shot);
    }
    drawTracers(tracers, shots);
    look([38, 16, -36], [4, 5, -66]);
    await picture('fortress-gun-sweep');
  }

  if (wanted('fortress-gun-cover')) {
    // the mech just seaward of the wreck at (30, -64), with the nest beyond it
    tracers.lines.geometry.setDrawRange(0, 0);
    game.mech.x = 30;
    game.mech.z = -60;
    model.position.set(game.mech.x, game.mech.y, game.mech.z);
    look([30, 5.5, -48], [22, 8, -68]);
    await picture('fortress-gun-cover');
  }

  if (wanted('fortress-gun-sea')) {
    // the nest's beat out to sea: at 2.6 s the third gun (the nest) fires and the battery's two are between beats
    model.visible = false;
    game.time = 2.6 + 0.05;
    drawSeaFire(seaFire, game);
    look([55, 26, -28], [8, 12, -70]);
    await picture('fortress-gun-sea');
  }
});
