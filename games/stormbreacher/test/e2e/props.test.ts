import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { scene } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// The tests share one page: each starts the sortie again directly.
beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

// How many copies of a kind are drawn: the instanced meshes under the scene with that name (the chunks may split one).
function drawn(name: string): number {
  let count = 0;
  scene.traverse(child => {
    if (child instanceof THREE.InstancedMesh && child.name === name) count += child.count;
  });
  return count;
}

test('a sortie draws the low walls and the stairs', async () => {
  startSortie();
  await frame();
  const map = currentGame()?.map;
  if (!map) throw new Error('the sortie has not started');
  for (const kind of ['lowWall', 'stairs'] as const) {
    const placed = map.props.filter(prop => prop.kind === kind).length;
    expect(placed, kind).toBeGreaterThan(0);
    expect(drawn(kind), kind).toBe(placed);
  }
});
