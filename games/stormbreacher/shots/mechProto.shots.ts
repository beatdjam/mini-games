// Screenshots of the prototype mech (SB-1468): #view-mech?proto from the front, the rear quarter, the front 3/4 and the
// side, with its shadow and the surroundings' light on, on the beach. The same four angles are taken of the sortie's
// mech as it is now, so the two can be compared side by side. npm run shots. Not a test: it is not part of npm test or
// the CI (the drawn pixels differ between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text>
// takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { systems } from '@engine/core/index.ts';
import { camera, renderer, scene } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { showMech } from '../src/dev/views/mech.ts';
import { disposeMech } from '../src/view/mechModel.ts';
import { disposeProtoMech } from '../src/view/mechProtoModel.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

async function picture(name: string): Promise<void> {
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

// The view's own system moves the camera and the mech every frame; the pictures set the camera by hand, so it is stopped.
function stopView(): void {
  for (const system of systems) if (system.name === 'sb-mech') system.enabled = false;
}

function clearView(before: Set<THREE.Object3D>): void {
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
  document.getElementById('sbMechBar')?.remove();
  document.getElementById('sbTunePanel')?.remove();
  scene.environment = null;
  renderer.shadowMap.enabled = false;
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

// The camera places the four pictures take, in heights from the mech's feet; every shot uses the same four, so the
// prototype and the sortie's mech are framed alike.
const ANGLES = [
  { name: 'front', at: [0, 0.55, -1.8] },
  { name: 'rear', at: [1.1, 0.62, 1.5] },
  { name: 'quarter', at: [1.4, 0.6, -1.4] },
  { name: 'side', at: [1.8, 0.55, 0] },
] as const;

test('mech-proto', async () => {
  const height = MECH_TUNE.height;
  const params = new URLSearchParams(location.search);
  params.set('pattern', 'e');
  params.set('spin', '0');
  params.set('proto', '1');
  params.delete('compare');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}#view-mech`);

  const beforeProto = new Set(scene.children);
  showMech('#view-mech');
  stopView();
  const proto = scene.children.find(child => child.name === 'mech-proto');
  if (!proto) throw new Error('#view-mech?proto built no prototype');
  const at = { x: proto.position.x, z: proto.position.z };
  const look = (px: number, py: number, pz: number) => {
    camera.position.set(at.x + px * height, py * height, at.z + pz * height);
    camera.lookAt(at.x, 0.5 * height, at.z);
  };
  try {
    for (const angle of ANGLES) {
      if (!wanted(`mech-proto-${angle.name}`)) continue;
      look(angle.at[0], angle.at[1], angle.at[2]);
      await picture(`mech-proto-${angle.name}`);
    }
  } finally {
    clearView(beforeProto);
    disposeProtoMech(proto);
  }

  // The sortie's mech as it is now, from the same four angles.
  params.delete('proto');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}#view-mech`);
  const beforeBase = new Set(scene.children);
  showMech('#view-mech');
  stopView();
  const base = scene.children.find(child => child.name === 'mech');
  if (!base) throw new Error('#view-mech built no mech');
  const baseAt = { x: base.position.x, z: base.position.z };
  const lookBase = (px: number, py: number, pz: number) => {
    camera.position.set(baseAt.x + px * height, py * height, baseAt.z + pz * height);
    camera.lookAt(baseAt.x, 0.5 * height, baseAt.z);
  };
  try {
    for (const angle of ANGLES) {
      if (!wanted(`mech-proto-base-${angle.name}`)) continue;
      lookBase(angle.at[0], angle.at[1], angle.at[2]);
      await picture(`mech-proto-base-${angle.name}`);
    }
  } finally {
    clearView(beforeBase);
    disposeMech(base);
  }
});
