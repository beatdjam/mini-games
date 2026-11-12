import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { drawStats, scene } from '@engine/render/index.ts';
import { boot } from '../../src/app/boot.ts';
import { FX_STAGES } from '../../src/data/tune.ts';
import { showFx } from '../../src/dev/views/fx.ts';
import { BATTLE_GROUP_NAME } from '../../src/view/battle/index.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frames = async (n: number): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
};

test('#view-fx stage 2 draws the battle: the allies, the holes and the smoke', async () => {
  history.replaceState(null, '', '#view-fx?fx=2&seed=1');
  showFx('#view-fx?fx=2&seed=1');
  await frames(40);
  const group = scene.children.find(child => child.name === BATTLE_GROUP_NAME);
  expect(group).toBeDefined();
  const drawn: THREE.InstancedMesh[] = [];
  group!.traverse(object => {
    const mesh = object as THREE.InstancedMesh;
    if (mesh.isInstancedMesh === true && mesh.visible && mesh.count > 0) drawn.push(mesh);
  });
  expect(drawn.filter(mesh => mesh.count === Math.round(FX_STAGES[2].allies)).length).toBeGreaterThanOrEqual(2);
  expect(drawn.length).toBeGreaterThanOrEqual(5);
  console.log(`#view-fx stage 2: ${drawStats()}`);
});
