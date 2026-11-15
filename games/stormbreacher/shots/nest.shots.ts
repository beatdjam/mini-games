// Screenshots of the machine-gun nest's model (SB-1981): the front nest firing just after the landing, the six nests
// seen from before B, a nest forty metres out in the aim, and one put down. The pictures keep the game's fog. npm run
// shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ between machines).
// SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
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
import { hudModel } from '../src/logic/hud.ts';
import { stream } from '../src/logic/rng.ts';
import { screenRect } from '../src/view/camera.ts';
import { buildEnemyView, drawEnemies, removeEnemyView, type EnemyView } from '../src/view/enemies.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../src/view/field.ts';
import { buildPlayHud, drawHud, removeHud } from '../src/view/hud.ts';
import { applyLookTo } from '../src/view/look.ts';
import { buildMechVisual } from '../src/view/mechModel.ts';
import { buildWorld, type World } from '../src/view/world.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set
const HIDDEN = 'body *:not(#gl):not(#sbPlayHud):not(#sbPlayHud *) { visibility: hidden !important; }'; // the 3D view and the aim shot's HUD
const DT = 1 / 60;
const BURST_SECONDS = 3.8; // long enough for the first burst of every nest that can see the mech
const TRACER_LENGTH = 6; // a little longer than the game's 4 m, so a burst reads in a picture (m)
const MAX_TRACERS = 64;
const FRONT_NEST = 0; // the nest at (-30, 147), the one the landing wakes first

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

async function picture(name: string, fov = 72): Promise<void> {
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  // the page lays the camera out again for the window's size, so the shot's own field of view is put on last
  camera.fov = fov;
  camera.updateProjectionMatrix();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

function look(pos: readonly [number, number, number], at: readonly [number, number, number]): void {
  camera.position.set(...pos);
  camera.lookAt(...at);
  camera.updateProjectionMatrix();
}

function hideField(): void {
  for (const name of [GROUND_NAME, SIZE_BOX_NAME]) {
    const node = scene.getObjectByName(name);
    if (node) node.visible = false;
  }
}

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

function drawTracers(
  tracers: { lines: THREE.LineSegments; positions: THREE.BufferAttribute },
  shots: readonly EnemyShot[],
): void {
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
}

// The map and mech the manual shots stage, and what takes them out again.
interface Stage {
  game: ReturnType<typeof newGame>;
  world: World;
  model: THREE.Group;
  view: EnemyView;
  tracers: { lines: THREE.LineSegments; positions: THREE.BufferAttribute };
  dispose(): void;
}

function stage(mechX: number, mechZ: number, mechYaw: number): Stage {
  const world = buildWorld(M1B_HAND);
  applyLookTo(lookOf(M1.id), world.built.group);
  hideField();
  const game = newGame(M1B_HAND);
  const model = buildMechVisual(
    { build: M1_MECH, palette: M1_MECH_PALETTE, weaponScale: M1_WEAPON_SCALE },
    MECH_TUNE.height,
  );
  model.position.set(mechX, 0, mechZ);
  model.rotation.y = mechYaw;
  scene.add(model);
  const view = buildEnemyView();
  const tracers = buildTracers();
  return {
    game,
    world,
    model,
    view,
    tracers,
    dispose() {
      scene.remove(world.built.group);
      scene.remove(world.targetGroup);
      scene.remove(world.shore);
      scene.remove(model);
      removeEnemyView(view);
      scene.remove(tracers.lines);
      tracers.lines.geometry.dispose();
      (tracers.lines.material as THREE.Material).dispose();
    },
  };
}

// Puts the six nests out and runs the seconds the awake ones fire in. The down one stays down.
function placeNests(
  stage: Stage,
  mechX: number,
  mechZ: number,
  awake: readonly number[],
  down: number | null,
): EnemyShot[] {
  const places = M1B_HAND.spawns['b-emplacements'] ?? [];
  stage.game.mech.x = mechX;
  stage.game.mech.z = mechZ;
  stage.game.mech.y = 0;
  stage.game.enemies = places.map((place, i) =>
    newEnemy(`b-emplacements-${i + 1}`, 'b-emplacements', 'emplacement', place.x, place.z, 0, true),
  );
  const enemyWorld = {
    rects: stage.game.rects,
    propBoxes: stage.game.propBoxes,
    bounds: M1B_HAND.bounds,
    nav: null,
    others: stage.game.enemies,
  };
  const shots: EnemyShot[] = [];
  for (let i = 0; i < Math.round(BURST_SECONDS / DT); i++) {
    for (const [index, nest] of stage.game.enemies.entries()) {
      nest.dormant = !awake.includes(index);
      nest.awake = awake.includes(index);
      if (index === down) continue;
      const shot = stepEnemy(nest, stage.game.mech, enemyWorld, DT, stream('emplacements'));
      if (shot) shots.push(shot);
    }
  }
  if (down !== null) {
    const nest = stage.game.enemies[down];
    if (nest) {
      nest.yaw = Math.atan2(nest.x - mechX, nest.z - mechZ);
      nest.hp = 0;
    }
  }
  drawEnemies(stage.view, stage.game);
  drawTracers(stage.tracers, shots);
  return shots;
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('nest model', async () => {
  // Just off the player's craft: the front nest is awake and sweeps its burst across the mech.
  const landing = stage(-2, 165, 1);
  try {
    placeNests(landing, -2, 165, [FRONT_NEST], null);
    look([12, 8, 184], [-24, 1.2, 150]);
    if (wanted('nest-landing')) await picture('nest-landing');
  } finally {
    landing.dispose();
  }

  // From before B: all six stand in three pairs down the beach.
  const line = stage(0, 165, 0);
  try {
    placeNests(line, 0, 165, [0, 1, 2, 3, 4, 5], null);
    look([5, 120, 170], [5, 0, 95]);
    if (wanted('nest-b-line')) await picture('nest-b-line', 55);
  } finally {
    line.dispose();
  }

  // The right nest of line 1 put down: its enclosure broken open and the gun tipped over.
  const down = stage(45, 160, 0);
  try {
    placeNests(down, 45, 160, [0, 1], 1);
    look([48, 2.2, 153], [45, 0.7, 146.5]);
    if (wanted('nest-down')) await picture('nest-down');
  } finally {
    down.dispose();
  }
});

test('nest aim', async () => {
  // The right nest of line 1, forty metres from the mech, seen through the real HUD: the aim circle round it and the
  // soft lock's frame on it. The camera is the shot's, not the game's, so the mech stands aside.
  const aim = stage(5, 168, -0.98);
  const hud = buildPlayHud(document.body);
  try {
    placeNests(aim, 5, 168, [1], null);
    aim.game.aimTarget = 'b-emplacements-2';
    look([2, 6, 178], [45, 1.2, 147]);
    const model = hudModel(aim.game);
    drawHud(hud, model, model.lock === null ? null : screenRect(model.lock, camera, 1280, 720));
    if (wanted('nest-aim')) await picture('nest-aim');
  } finally {
    removeHud(hud);
    aim.dispose();
  }
});
