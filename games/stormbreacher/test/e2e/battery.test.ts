import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { scene } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { SEA_FLASH_NAME, SEA_TRACER_NAME } from '../../src/view/seaFire.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// The tests share one page: each starts the sortie again directly.
beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

// The meshes in the scene with this name.
function named(name: string): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  scene.traverse(child => {
    if (child.name === name) found.push(child);
  });
  return found;
}

test('the magazine’s shutter is drawn, and goes once both main guns are down', async () => {
  startSortie();
  await frame();
  const plates = named('sb-shutter-magazine');
  expect(plates).toHaveLength(1);
  expect(plates[0].visible).toBe(true);
  // one gun down is not enough
  game().targets.find(target => target.id === 'main-gun-1')!.hp = 0;
  await frame();
  await frame();
  expect(plates[0].visible).toBe(true);
  game().targets.find(target => target.id === 'main-gun-2')!.hp = 0;
  await frame();
  await frame();
  expect(game().shutters[0].open).toBe(true);
  expect(plates[0].visible).toBe(false);
});

test('starting again draws one shutter, and it is shut again', async () => {
  startSortie();
  await frame();
  const plates = named('sb-shutter-magazine');
  expect(plates).toHaveLength(1);
  expect(plates[0].visible).toBe(true);
});

test('a main gun flashes and streaks a line toward the sea on its beat, and a fallen gun stops', async () => {
  startSortie();
  await frame();
  const flashes = named(SEA_FLASH_NAME);
  const tracers = named(SEA_TRACER_NAME);
  expect(flashes).toHaveLength(2);
  expect(tracers).toHaveLength(2);
  // the first gun's beat is at 0 s: just after it, the flash and the line show
  game().time = 0;
  await frame();
  expect(flashes[0].visible).toBe(true);
  expect(tracers[0].visible).toBe(true);
  // the gun that falls shows nothing, and the other keeps its beat
  game().targets.find(target => target.id === 'main-gun-1')!.hp = 0;
  await frame();
  expect(flashes[0].visible).toBe(false);
  expect(tracers[0].visible).toBe(false);
});
