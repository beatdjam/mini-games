// Screenshots of the infantry droids' second pass (SB-1747) and close form (SB-2085): one droid standing, waiting and
// fallen (#view-droid), beside the mech, the squads walking on the beach, the crowd, and the riders on the landing craft.
// npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ between machines).
// SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { LOOP, runSystems, systems } from '@engine/core/index.ts';
import { camera, scene } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { currentGame } from '../src/app/play.ts';
import { BATTLE_TUNE, MECH_TUNE } from '../src/data/tune.ts';
import { DROID_VIEW_AT, showDroid } from '../src/dev/views/droid.ts';
import { showLanding } from '../src/dev/views/landing.ts';
import { showSquad } from '../src/dev/views/squad.ts';
import { buildProtoMech } from '../src/view/mechProtoModel.ts';
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

// Stops the systems so a picture can set the camera by hand, and puts them back afterwards.
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

// Takes the droid view's own map and meshes out of the scene, so the next pose starts clean.
function clearDroid(before: Set<THREE.Object3D>): void {
  for (const child of scene.children.filter(child => !before.has(child))) {
    scene.remove(child);
    child.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh !== true) return;
      const geometry = mesh.geometry;
      geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
  }
  document.getElementById('sbDroidBar')?.remove();
  document.getElementById('sbDroidNote')?.remove();
  for (let i = systems.length - 1; i >= 0; i--) if (systems[i].name === 'sb-droid') systems.splice(i, 1);
}

// Shows one droid in the pose the hash names and takes the shots the callback frames.
async function droidPictures(hash: string, shots: () => Promise<void>): Promise<void> {
  const before = new Set(scene.children);
  showDroid(hash);
  const view = holdView();
  try {
    await shots();
  } finally {
    view();
    clearDroid(before);
  }
}

beforeAll(async () => {
  // the dev views load by a dynamic import in main.ts: wait for it, or a late #view-… run takes the camera back
  await import('../src/dev/dev.ts');
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('droid2', async () => {
  const { x, z } = DROID_VIEW_AT;
  // the single droid standing: front, front quarter and beside the mech, framed on the whole 1.56 m body
  await droidPictures('#view-droid?spin=0', async () => {
    await picture('droid2-front', { eye: [x, 1.0, z - 1.9], look: [x, 0.84, z] });
    await picture('droid2-quarter', { eye: [x + 1.3, 1.05, z - 1.4], look: [x, 0.84, z] });
    // SB-2085: the close droid beside the player's mech, to judge the infantry against the machine
    const view = scene.getObjectByName('sb-droid-view');
    if (!view) throw new Error('the droid view is not in the scene');
    const mech = buildProtoMech(MECH_TUNE.height);
    mech.position.set(x + 2.4, 0, z + 0.3);
    view.add(mech);
    await picture('droid2-beside-mech', { eye: [x + 1.1, 2.7, z - 8], look: [x + 1.2, 1.5, z] });
  });

  // the squat at the hold line: lower and leaning onto the toes
  await droidPictures('#view-droid?spin=0&pose=wait', async () => {
    await picture('droid2-wait', { eye: [x + 1.2, 1.0, z - 1.5], look: [x, 0.66, z] });
  });

  // lying on its back, the rifle across the chest: from above the head and from the side
  await droidPictures('#view-droid?spin=0&pose=fallen', async () => {
    await picture('droid2-fallen', { eye: [x + 1.4, 2.4, z + 1.2], look: [x, 0.2, z + 0.1] });
    await picture('droid2-fallen-side', { eye: [x + 2.4, 0.9, z + 0.2], look: [x, 0.2, z + 0.1] });
  });

  // the squads on their way to the nests, close enough to read the droids
  showSquad('#view-squad');
  await until(() => currentGame() !== null);
  await until(() => game().script.cutscene === null);
  LOOP.maxDt = 0;
  advance(1.5);
  // the near and far forms are separate meshes (SB-2085): read both, so the picture does not depend on which one the view
  // chose for the first wave
  const soldierBodies = (): THREE.InstancedMesh[] =>
    ['sb-battle-bodies', 'sb-battle-bodies-far']
      .map(name => scene.getObjectByName(name))
      .filter((mesh): mesh is THREE.InstancedMesh => mesh instanceof THREE.InstancedMesh && mesh.count > 0);
  const bodies = soldierBodies()[0];
  if (!bodies) throw new Error('the battle drew no droid');
  const matrix = new THREE.Matrix4();
  const target = new THREE.Vector3();
  bodies.getMatrixAt(0, matrix);
  target.setFromMatrixPosition(matrix);
  const held = holdView();
  try {
    await picture('droid2-squad-run', {
      eye: [target.x + 4.5, 1.8, target.z + 3.5],
      look: [target.x, 0.85, target.z - 0.5],
    });
  } finally {
    held();
  }

  // the waiting line: the wave walks to its hold line and stands there, the squat showing as a lower, leaning rank.
  // SB-2020 gave the crowd four hold lines; with no cues called, the first wave waits at the beach's.
  advance(6);
  const line = new THREE.Matrix4();
  const place = new THREE.Vector3();
  let waitAt: THREE.Vector3 | null = null;
  let best = Infinity;
  for (const mesh of soldierBodies()) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, line);
      place.setFromMatrixPosition(line);
      const near = Math.abs(place.z - BATTLE_TUNE.holdBeachZ);
      if (near < best) {
        best = near;
        waitAt = place.clone();
      }
    }
  }
  if (waitAt === null) throw new Error('no droid reached the hold line');
  const lineHeld = holdView();
  try {
    await picture('droid2-hold-line', {
      eye: [waitAt.x - 2.2, 1.5, waitAt.z + 1.4],
      look: [waitAt.x, 0.75, waitAt.z],
    });
  } finally {
    lineHeld();
  }

  // the riders on the deck, held at the second the camera is on the deck; the squad view's landing skip must go, or it
  // would pass over the cutscene before the picture
  for (let i = systems.length - 1; i >= 0; i--) if (systems[i].name === 'sb-squad-skip') systems.splice(i, 1);
  showLanding('#view-landing?at=7.4');
  await until(() => game().script.cutscene !== null);
  for (let i = 0; i < 4; i++) await frame();
  if (wanted('droid2-riders')) await page.screenshot({ path: `${__SHOTS_OUT__}/droid2-riders.png` });
});
