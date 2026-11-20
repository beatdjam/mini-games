// Screenshots of the mech kits (SB-2080): each named kit from #view-mech?kit=... at the same three angles, so the
// skeleton and the swapped parts and palettes can be compared with the three-view drawings. npm run shots. Not a test:
// the drawn pixels differ between machines. SHOTS_OUT=<folder> picks where the pictures go; SHOTS_ONLY=<text> takes only
// the shots whose names contain it.
import { beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { systems } from '@engine/core/index.ts';
import { camera, renderer, scene } from '@engine/render/index.ts';
import { boot } from '../src/app/boot.ts';
import { PROTO_KIT_IDS, PROTO_KITS } from '../src/data/mechProto.ts';
import { MECH_TUNE } from '../src/data/tune.ts';
import { showMech } from '../src/dev/views/mech.ts';
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

const ANGLES = [
  { name: 'front', at: [0, 0.55, -1.8] },
  { name: 'rear', at: [1.1, 0.62, 1.5] },
  { name: 'quarter', at: [1.4, 0.6, -1.4] },
  { name: 'side', at: [1.8, 0.55, 0] },
] as const;

test('mech-kit', async () => {
  const height = MECH_TUNE.height;
  for (const kit of PROTO_KIT_IDS) {
    const params = new URLSearchParams(location.search);
    params.set('pattern', 'e');
    params.set('spin', '0');
    params.set('kit', kit);
    params.delete('proto');
    params.delete('compare');
    history.replaceState(null, '', `${location.pathname}?${params.toString()}#view-mech`);
    const before = new Set(scene.children);
    showMech('#view-mech');
    stopView();
    const proto = scene.children.find(child => child.name === 'mech-proto');
    if (!proto) throw new Error(`#view-mech?kit=${kit} built no prototype`);
    const at = { x: proto.position.x, z: proto.position.z };
    // a kit that stands a size larger (the boss) is framed at its own height, so its head and turret fit the picture
    const frame = height * (PROTO_KITS[kit].scale ?? 1);
    try {
      for (const angle of ANGLES) {
        camera.position.set(at.x + angle.at[0] * frame, angle.at[1] * frame, at.z + angle.at[2] * frame);
        camera.lookAt(at.x, 0.5 * frame, at.z);
        await picture(`mech-kit-${kit}-${angle.name}`);
      }
    } finally {
      clearView(before);
      disposeProtoMech(proto);
    }
  }
});
