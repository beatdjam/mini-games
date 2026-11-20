import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { scene } from '@engine/render/index.ts';
import { boot } from '../../src/app/boot.ts';
import { showMech } from '../../src/dev/views/mech.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

interface KitReport {
  kit: string | null;
  proto: { calls: number; triangles: number; shapes: number } | null;
}

const report = (): KitReport => JSON.parse(window.sbMechReport!()) as KitReport;

// SB-2080: ?kit picks the parts and the palette, and the row of kit buttons swaps them without a frame. The test runs
// the page by hand (showMech and a click do their work at once), so a slow drawn frame cannot time it out.
test('#view-mech?kit builds the chosen kit, and its buttons swap the parts and the palette', () => {
  const params = new URLSearchParams(location.search);
  params.set('kit', 'sniper');
  params.delete('proto');
  params.delete('compare');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}#view-mech`);
  showMech('#view-mech');
  const sniper = report();
  expect(sniper.kit).toBe('sniper');
  expect(sniper.proto?.calls).toBe(4);
  expect(sniper.proto?.triangles).toBeGreaterThan(0);

  const buttons = [...document.querySelectorAll<HTMLButtonElement>('#sbKitBar button')];
  const enemy = buttons.find(node => node.textContent === '敵（灰・赤）');
  if (!enemy) throw new Error('no enemy kit button');
  enemy.click();
  const swapped = report();
  expect(swapped.kit).toBe('enemy');
  expect(swapped.proto?.calls).toBe(4);
  expect(swapped.proto?.triangles).not.toBe(sniper.proto?.triangles);
  expect(new URLSearchParams(location.search).get('kit')).toBe('enemy');

  // SB-2084: the boss's own row (black and red, a size larger) is one more kit the bar can swap to
  const boss = buttons.find(node => node.textContent === 'ボス（黒・赤）');
  if (!boss) throw new Error('no boss kit button');
  boss.click();
  const larger = report();
  expect(larger.kit).toBe('boss');
  expect(larger.proto?.calls).toBe(4);
  expect(new URLSearchParams(location.search).get('kit')).toBe('boss');

  // the group is still the skeleton's: one skinned mesh per material, the same four draws
  const group = scene.children.find(child => child.name === 'mech-proto');
  expect(group).toBeDefined();
  const meshes: THREE.SkinnedMesh[] = [];
  group!.traverse(object => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh === true) meshes.push(object as THREE.SkinnedMesh);
  });
  expect(meshes.length).toBe(4);
});
