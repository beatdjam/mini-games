// Screenshots of the allies' gunfight (SB-1600): the three at their posts behind line 1 shooting at enemies, an enemy
// shooting back at them at C, and the three at C's posts. npm run shots. Not a test: it is not part of npm test or the CI
// (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes
// only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { LOOP, runSystems, systems } from '@engine/core/index.ts';
import { camera, scene } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../src/app/play.ts';
import { ALLY_TUNE } from '../src/data/allies.ts';
import { boot } from '../src/app/boot.ts';
import { ENEMIES, ENEMY_CHEST } from '../src/data/enemies.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { newEnemy } from '../src/logic/enemies.ts';
import { sendToScript } from '../src/logic/game.ts';
import { BATTLE_GROUP_NAME } from '../src/view/battle/index.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
const PILLBOXES = ['pillbox-1', 'pillbox-2'] as const;

// Where the enemies stand (m); +z is the sea and the allies' B posts are at z 110..129, C's posts at z 0..9.
const B_ENEMIES = [
  { x: 0, z: 70 },
  { x: 35, z: 70 },
  { x: 70, z: 70 },
] as const;
const C_ENEMIES = [
  { x: 0, z: -55 },
  { x: 35, z: -55 },
  { x: 70, z: -55 },
] as const;

// Where the camera stands and where it looks (m).
const B_POSTS = { eye: [-12, 14, 140], at: [26, 2, 112] } as const;
const C_POSTS = { eye: [50, 16, 30], at: [20, 1, -15] } as const;

interface Spot {
  x: number;
  y: number;
  z: number;
}

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

// Keeps the mech alive while the hand-run seconds pass, so the enemies stay awake and the pictures show a fight.
function repair(): void {
  const current = game();
  current.armor = MECH_TUNE.armor;
  current.barrages = [];
  current.shells = [];
  current.aimed = null;
  current.battery.on = false;
}

// Step the game by hand: the drawn frames add no time (LOOP.maxDt = 0), so the seconds are the ones written here.
function advance(seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    repair();
    runSystems(1 / 60);
  }
}

function putEnemies(prefix: string, places: readonly { x: number; z: number }[]): void {
  places.forEach((place, i) => {
    game().enemies.push(newEnemy(`shot-${prefix}-${i + 1}`, 'shot', 'grunt', place.x, place.z));
  });
}

// The battle's tracer instances: the instanced box six metres long that carries every tracer.
function tracerMesh(): THREE.InstancedMesh | null {
  const group = scene.getObjectByName(BATTLE_GROUP_NAME);
  if (!group) return null;
  let found: THREE.InstancedMesh | null = null;
  group.traverse(object => {
    if (found !== null) return;
    const mesh = object as THREE.InstancedMesh;
    if (mesh.isInstancedMesh === true && (mesh.geometry as THREE.BoxGeometry).parameters?.depth === 6) found = mesh;
  });
  return found;
}

// The tracer an enemy has just sent at an ally, as the two chests it flies between, or null.
function enemyTracerFlight(): { from: Spot; to: Spot } | null {
  const mesh = tracerMesh();
  if (!mesh || mesh.count === 0) return null;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const heading = new THREE.Vector3();
  for (const enemy of game().enemies) {
    if (enemy.hp <= 0 || !enemy.awake) continue;
    const from = { x: enemy.x, y: enemy.y + ENEMIES[enemy.kind].height * ENEMY_CHEST, z: enemy.z };
    for (const ally of game().allies) {
      if (ally.down) continue;
      const to = { x: ally.x, y: ally.y + ALLY_TUNE.fireHeight, z: ally.z };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dz = to.z - from.z;
      const dist = Math.hypot(dx, dy, dz) || 1;
      if (dist > ALLY_TUNE.enemyTracerRange) continue;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        matrix.decompose(position, rotation, scale);
        if (Math.hypot(position.x - from.x, position.y - from.y, position.z - from.z) > 15) continue;
        heading.set(0, 0, 1).applyQuaternion(rotation);
        if ((heading.x * dx + heading.y * dy + heading.z * dz) / dist > 0.8) return { from, to };
      }
    }
  }
  return null;
}

// A camera to the side of the two chests, so the tracer between them crosses the frame.
function sideOf(flight: { from: Spot; to: Spot }): { eye: number[]; at: number[] } {
  const mx = (flight.from.x + flight.to.x) / 2;
  const my = (flight.from.y + flight.to.y) / 2;
  const mz = (flight.from.z + flight.to.z) / 2;
  const dx = flight.to.x - flight.from.x;
  const dz = flight.to.z - flight.from.z;
  const len = Math.hypot(dx, dz) || 1;
  return {
    eye: [mx - (dz / len) * 28, my + 8, mz + (dx / len) * 28],
    at: [mx, my - 1, mz],
  };
}

// Holds the game still, puts the camera where the picture needs it, draws one frame and takes the picture.
async function picture(name: string, place: { eye: readonly number[]; at: readonly number[] }): Promise<void> {
  LOOP.maxDt = 0;
  await frame();
  const play = systems.find(system => system.name === 'sb-play');
  if (play) play.enabled = false;
  camera.position.set(place.eye[0], place.eye[1], place.eye[2]);
  camera.lookAt(place.at[0], place.at[1], place.at[2]);
  await frame();
  if (wanted(name)) await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
  if (play) play.enabled = true;
}

// Starts the sortie and passes over the landing. The five allies come out with the ashore cue, once the mech is off the
// craft.
async function beach(): Promise<void> {
  startSortie();
  await until(() => game().script.cutscene !== null);
  sendToScript(game(), { kind: 'skip' });
  await until(() => game().script.cutscene === null);
}

// Fires cp1 as the player's charges would: both pillboxes down at once.
function breakPillboxes(): void {
  for (const id of PILLBOXES) {
    const target = game().targets.find(entry => entry.id === id);
    if (target) target.hp = 0;
    sendToScript(game(), { kind: 'destroyed', target: id });
  }
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('gunfight', async () => {
  await beach();
  LOOP.maxDt = 0;

  // B: the three at their posts behind line 1 shoot at the three enemies in front of them
  game().mech.x = 0;
  game().mech.z = 140;
  sendToScript(game(), { kind: 'enter', area: 'b-line' });
  putEnemies('b', B_ENEMIES);
  advance(10);
  await picture('gunfight-b-posts', B_POSTS);

  // C: cp1 sends the three on to their posts at C, and the enemies there answer their tracers
  breakPillboxes();
  sendToScript(game(), { kind: 'skip' });
  putEnemies('c', C_ENEMIES);
  advance(40);
  // frame the moment an enemy tracer is on its way from its chest to an ally's
  let flight: { from: Spot; to: Spot } | null = null;
  for (let i = 0; i < 60 * 20 && flight === null; i++) {
    repair();
    runSystems(1 / 60);
    flight = enemyTracerFlight();
  }
  if (flight === null) throw new Error('no enemy tracer crossed to an ally');
  for (let i = 0; i < 10; i++) {
    repair();
    runSystems(1 / 60);
  }
  await picture('gunfight-enemy-fire', sideOf(flight));
  await picture('gunfight-c-posts', C_POSTS);
});
