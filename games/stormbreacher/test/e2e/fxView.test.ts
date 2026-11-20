import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { runSystems } from '@engine/core/index.ts';
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
  // 40 frames of the page, the systems run by hand but the last: drawn frames timed out on CI
  for (let i = 0; i < 39; i++) runSystems(1 / 60);
  await frames(1);
  const group = scene.children.find(child => child.name === BATTLE_GROUP_NAME);
  expect(group).toBeDefined();
  const drawn: THREE.InstancedMesh[] = [];
  group!.traverse(object => {
    const mesh = object as THREE.InstancedMesh;
    if (mesh.isInstancedMesh === true && mesh.visible && mesh.count > 0) drawn.push(mesh);
  });
  // the soldiers are split between the close and far forms (SB-2085); together they hold the stage's whole wave once
  const soldierCount = (names: readonly string[]): number =>
    names.reduce((sum, name) => {
      const mesh = group!.getObjectByName(name);
      return mesh instanceof THREE.InstancedMesh ? sum + mesh.count : sum;
    }, 0);
  const allies = Math.round(FX_STAGES[2].allies);
  expect(soldierCount(['sb-battle-bodies', 'sb-battle-bodies-far'])).toBe(allies);
  expect(soldierCount(['sb-battle-heads', 'sb-battle-heads-far'])).toBe(allies);
  expect(drawn.length).toBeGreaterThanOrEqual(5);
  console.log(`#view-fx stage 2: ${drawStats()}`);
});
