// Screenshots of the prototype mech (SB-1468, second pass SB-1469, third pass SB-1471): #view-mech?proto from the front,
// the rear quarter, the front 3/4 and the side, plus two close pictures (the chest and head, a leg's joints), one from
// the sortie's overview camera, and two of the motion (mid-walk, the crouch of a jump). Every shot keeps the shadow and
// the surroundings' light on, on the beach. The same four angles are taken of the sortie's mech as it is now, so the two
// can be compared side by side. npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ
// between machines). SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names
// contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { systems } from '@engine/core/index.ts';
import { camera, renderer, scene } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { FOV_TUNE, MECH_TUNE, QUARTER_TUNE } from '../src/data/tune.ts';
import { showMech } from '../src/dev/views/mech.ts';
import { quarterPose } from '../src/view/quarterCamera.ts';
import { disposeMech } from '../src/view/mechModel.ts';
import { animateProtoMech, disposeProtoMech } from '../src/view/mechProtoModel.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view
const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the state was set

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

async function picture(name: string): Promise<void> {
  if (!wanted(name)) return;
  for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
  await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
}

// The views' systems move the camera and the mech every frame; the pictures set the camera by hand, so they are stopped.
function stopView(): void {
  for (const system of systems) system.enabled = false;
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
  document.getElementById('sbKitBar')?.remove();
  document.getElementById('sbTunePanel')?.remove();
  document.getElementById('sbProtoPanel')?.remove();
  scene.environment = null;
  renderer.shadowMap.enabled = false;
}

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
  // main.ts imports the dev views after boot; wait for that import, so a view does not run late and move the camera
  await import('../src/dev/dev.ts');
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

// The camera places the four whole-mech pictures take, in heights from the mech's feet; every shot uses the same four,
// so the prototype and the sortie's mech are framed alike.
const ANGLES = [
  { name: 'front', at: [0, 0.55, -1.8] },
  { name: 'rear', at: [1.1, 0.62, 1.5] },
  { name: 'quarter', at: [1.4, 0.6, -1.4] },
  { name: 'side', at: [1.8, 0.55, 0] },
] as const;

// The two close pictures: the chest and head from the front 3/4, and a knee and thigh from the outside front.
const DETAILS = [
  { name: 'detail-chest', at: [0.32, 0.82, -0.55], look: [0, 0.8, 0] },
  { name: 'detail-leg', at: [0.55, 0.5, -0.8], look: [0.12, 0.3, -0.22] },
] as const;

test('mech-proto3', async () => {
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
  const look = (px: number, py: number, pz: number, lx = 0, ly = 0.5, lz = 0) => {
    camera.position.set(at.x + px * height, py * height, at.z + pz * height);
    camera.lookAt(at.x + lx * height, ly * height, at.z + lz * height);
  };
  try {
    for (const angle of ANGLES) {
      look(angle.at[0], angle.at[1], angle.at[2]);
      await picture(`mech-proto3-${angle.name}`);
    }
    for (const detail of DETAILS) {
      look(detail.at[0], detail.at[1], detail.at[2], detail.look[0], detail.look[1], detail.look[2]);
      await picture(`mech-proto3-${detail.name}`);
    }
    // the sortie's overview camera: the same place the game puts it above and behind the mech
    const pose = quarterPose({ x: at.x, y: 0, z: at.z }, QUARTER_TUNE);
    camera.position.copy(pose.pos);
    camera.lookAt(pose.look);
    camera.fov = QUARTER_TUNE.fov;
    camera.updateProjectionMatrix();
    await picture('mech-proto3-game');
    // the pictures after this one keep the field of view they had before the overview camera took it over
    camera.fov = FOV_TUNE.feel;
    camera.updateProjectionMatrix();

    // the motion: ten frames of walking catch the legs apart, then a hop's crouch bends the knees deep
    const walk = { speed: 6, grounded: true, boosting: false, landSpeed: null, fired: false };
    for (let n = 0; n < 10; n++) animateProtoMech(proto, walk, 1 / 60);
    look(ANGLES[2].at[0], ANGLES[2].at[1], ANGLES[2].at[2]);
    await picture('mech-proto3-walk');
    for (let n = 0; n < 30; n++) animateProtoMech(proto, { ...walk, speed: 0 }, 1 / 60);
    animateProtoMech(proto, { speed: 0, grounded: false, boosting: false, landSpeed: 12, fired: false }, 1 / 60);
    look(ANGLES[3].at[0], ANGLES[3].at[1], ANGLES[3].at[2]);
    await picture('mech-proto3-jump');
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
      lookBase(angle.at[0], angle.at[1], angle.at[2]);
      await picture(`mech-proto3-base-${angle.name}`);
    }
  } finally {
    clearView(beforeBase);
    disposeMech(base);
  }
});
