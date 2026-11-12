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

test('a sortie draws the low walls and the ramps', async () => {
  startSortie();
  await frame();
  const map = currentGame()?.map;
  if (!map) throw new Error('the sortie has not started');
  for (const kind of ['lowWall', 'ramp'] as const) {
    const placed = map.props.filter(prop => prop.kind === kind).length;
    expect(placed, kind).toBeGreaterThan(0);
    expect(drawn(kind), kind).toBe(placed);
  }
});

// The first object in the scene with this name, anywhere below it.
function find(name: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  scene.traverse(child => {
    if (!found && child.name === name) found = child;
  });
  return found;
}

test('a sortie draws every target of the map, the battery’s parts among them', async () => {
  startSortie();
  await frame();
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  const map = game.map;
  const group = find('targets');
  // the targets, and a plate for each shutter
  expect(group?.children).toHaveLength(map.targets.length + game.shutters.length);
  for (const id of ['main-gun-1', 'main-gun-2', 'magazine']) {
    expect(
      group?.children.some(child => child.name === id),
      id,
    ).toBe(true);
  }
});

test('a sortie draws the sea past the front edge and the landing craft behind the mech, and starting again leaves one of each', async () => {
  for (let sortie = 0; sortie < 2; sortie++) {
    startSortie();
    await frame();
    const game = currentGame();
    if (!game) throw new Error('the sortie has not started');
    const { maxX, minX, maxZ } = game.map.bounds;
    const shores = scene.children.filter(child => child.name === 'shore');
    expect(shores).toHaveLength(1);

    const sea = find('sea');
    const craft = find('craft');
    if (!sea || !craft) throw new Error('the sea or the landing craft is not in the scene');
    const seaBox = new THREE.Box3().setFromObject(sea);
    expect(seaBox.min.z).toBeCloseTo(maxZ, 6);
    expect(seaBox.min.x).toBeLessThan(minX);
    expect(seaBox.max.x).toBeGreaterThan(maxX);

    const craftBox = new THREE.Box3().setFromObject(craft);
    expect(craftBox.min.z).toBeGreaterThanOrEqual(maxZ - 6);
    expect(craftBox.max.z).toBeGreaterThan(game.mech.z + 10);
    expect(craftBox.max.y).toBeGreaterThan(seaBox.max.y + 1);
    // one draw a colour: the hull and the dark deck and ramp
    const meshes: THREE.Mesh[] = [];
    craft.traverse(child => {
      if (child instanceof THREE.Mesh) meshes.push(child);
    });
    expect(meshes).toHaveLength(2);
  }
});
