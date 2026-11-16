// Close pictures of the defence works and the landing craft (SB-1470): the hedgehog, the block, the low wall, the
// bunker and the craft from about eight metres, so the detail added to each shape can be compared before and after.
// npm run shots. Not a test: it is not part of npm test or the CI (the drawn pixels differ between machines).
// SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { camera, scene } from '@engine/render/index.ts';
import { buildDefenseLineup, DEFENSE_SHOTS } from '../src/dev/outdoor/defenseLineup.ts';
// loads the language files and boots the page, as the real page does
import '../src/main.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

// Eight metres from the middle of the object, a little above it and to its seaward side.
const OFFSET = new THREE.Vector3(0.68, 0.25, 0.68).normalize().multiplyScalar(8);
const DRAWN_FRAMES = 3; // frames drawn before the picture, so it does not show the one before the camera moved
const HIDDEN = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }'; // only the 3D view

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

beforeAll(async () => {
  await page.viewport(1280, 720);
  scene.add(buildDefenseLineup());
  const hide = document.createElement('style');
  hide.textContent = HIDDEN;
  document.head.appendChild(hide);
});

test('defenses', async () => {
  camera.fov = 55;
  camera.updateProjectionMatrix();
  for (const shot of DEFENSE_SHOTS) {
    if (!wanted(shot.name)) continue;
    const [x, y, z] = shot.look;
    camera.position.set(x + OFFSET.x, y + OFFSET.y, z + OFFSET.z);
    camera.lookAt(x, y, z);
    camera.updateMatrixWorld();
    for (let n = 0; n < DRAWN_FRAMES; n++) await frame();
    await page.screenshot({ path: `${__SHOTS_OUT__}/${shot.name}.png` });
  }
});
