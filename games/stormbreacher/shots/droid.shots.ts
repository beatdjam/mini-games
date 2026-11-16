// Screenshots of the infantry droids (SB-1745): one droid from the front and the front quarter (#view-droid), the squads
// walking on the beach (#view-squad), and the riders on the landing craft (#view-landing). npm run shots. Not a test: it
// is not part of npm test or the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the
// pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { LOOP, runSystems, systems } from '@engine/core/index.ts';
import { camera, scene } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { currentGame } from '../src/app/play.ts';
import { DROID_VIEW_AT, showDroid } from '../src/dev/views/droid.ts';
import { showLanding } from '../src/dev/views/landing.ts';
import { showSquad } from '../src/dev/views/squad.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

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

// Step the game by hand: the drawn frames add no time (LOOP.maxDt = 0), so the seconds are the ones written here.
function advance(seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) runSystems(1 / 60);
}

// Stops the systems so a picture can set the camera by hand, and puts the play system back afterwards.
function holdView(): () => void {
  const disabled = systems.map(system => [system, system.enabled] as const);
  for (const system of systems) system.enabled = false;
  return () => {
    for (const [system, enabled] of disabled) system.enabled = enabled;
  };
}

async function picture(name: string, at: { eye: readonly number[]; look: readonly number[] }): Promise<void> {
  camera.position.set(at.eye[0], at.eye[1], at.eye[2]);
  camera.lookAt(at.look[0], at.look[1], at.look[2]);
  await frame();
  if (wanted(name)) await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

// Takes the droid view's own map and meshes out of the scene, so the sortie's pictures are not drawn over it.
function clearDroid(before: Set<THREE.Object3D>): void {
  for (const child of scene.children.filter(child => !before.has(child))) {
    scene.remove(child);
    child.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh !== true) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
  }
  document.getElementById('sbDroidBar')?.remove();
  document.getElementById('sbDroidNote')?.remove();
  for (let i = systems.length - 1; i >= 0; i--) if (systems[i].name === 'sb-droid') systems.splice(i, 1);
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('droid', async () => {
  // the single droid: front and front quarter, framed on the whole 1.56 m body
  const before = new Set(scene.children);
  showDroid('#view-droid?spin=0');
  const view = holdView();
  try {
    await picture('droid-front', {
      eye: [DROID_VIEW_AT.x, 1.0, DROID_VIEW_AT.z - 1.9],
      look: [DROID_VIEW_AT.x, 0.84, DROID_VIEW_AT.z],
    });
    await picture('droid-quarter', {
      eye: [DROID_VIEW_AT.x + 1.3, 1.05, DROID_VIEW_AT.z - 1.4],
      look: [DROID_VIEW_AT.x, 0.84, DROID_VIEW_AT.z],
    });
  } finally {
    view();
    clearDroid(before);
  }

  // the squads on their way to the nests, close enough to read the droids
  showSquad('#view-squad');
  await until(() => currentGame() !== null);
  await until(() => game().script.cutscene === null);
  LOOP.maxDt = 0;
  advance(1.5);
  const bodies = scene.getObjectByName('sb-battle-bodies');
  if (!(bodies instanceof THREE.InstancedMesh) || bodies.count === 0) throw new Error('the battle drew no droid');
  const matrix = new THREE.Matrix4();
  const target = new THREE.Vector3();
  bodies.getMatrixAt(0, matrix);
  target.setFromMatrixPosition(matrix);
  const held = holdView();
  try {
    await picture('droid-squad-run', {
      eye: [target.x + 4.5, 1.8, target.z + 3.5],
      look: [target.x, 0.85, target.z - 0.5],
    });
  } finally {
    held();
  }

  // the riders on the deck, held at the second the camera looks along it; the squad view's landing skip must go, or it
  // would pass over the cutscene before the picture
  for (let i = systems.length - 1; i >= 0; i--) if (systems[i].name === 'sb-squad-skip') systems.splice(i, 1);
  showLanding('#view-landing?at=5.4');
  await until(() => game().script.cutscene !== null);
  for (let i = 0; i < 4; i++) await frame();
  if (wanted('droid-riders')) await page.screenshot({ path: `${__SHOTS_OUT__}/droid-riders.png` });
});
