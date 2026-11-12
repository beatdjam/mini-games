import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { el, t } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { currentGame, showResult, startSortie } from '../../src/app/play.ts';
import { state } from '../../src/app/screen.ts';
import { boot } from '../../src/app/boot.ts';
import { sendToScript } from '../../src/logic/game.ts';
import { enemyMeshName } from '../../src/view/enemies.ts';
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

// Runs frames until `done` says so, and fails when it never does.
async function until(done: () => boolean, tries = 240): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} frames`);
}

const enemyMeshes = (): THREE.Object3D[] => scene.children.filter(child => child.name === enemyMeshName('grunt'));

test('an enemy’s bullet that takes the last armour shows the result with the downed heading', async () => {
  startSortie();
  const current = game();
  current.armor = 1;
  const y = current.mech.y + MECH_TUNE.chestHeight;
  current.bullets.push({ enemy: 'grunt', x: current.mech.x, y, z: current.mech.z - 5, dx: 0, dy: 0, dz: 1, left: 50 });
  await until(() => state === 'result');
  expect(current.downed).toBe(true);
  expect(el('#sbResult').hidden).toBe(false);
  expect(el('#sbResult .title').textContent).toBe(t('result.downed'));
  expect(t('result.downed')).not.toBe(t('result.title'));
});

test('the script’s end keeps the cleared heading', () => {
  startSortie();
  showResult();
  expect(el('#sbResult .title').textContent).toBe(t('result.title'));
});

test('the enemies of a wave are drawn, and starting again leaves one set', async () => {
  startSortie();
  await frame();
  const none = enemyMeshes()[0] as THREE.InstancedMesh;
  expect(none.count).toBe(0);
  sendToScript(game(), { kind: 'enter', area: 'b-line' });
  await frame();
  expect(game().enemies).toHaveLength(6);
  expect(enemyMeshes()).toHaveLength(1);
  expect((enemyMeshes()[0] as THREE.InstancedMesh).count).toBe(6);

  startSortie();
  await frame();
  expect(enemyMeshes()).toHaveLength(1);
  expect((enemyMeshes()[0] as THREE.InstancedMesh).count).toBe(0);
});
