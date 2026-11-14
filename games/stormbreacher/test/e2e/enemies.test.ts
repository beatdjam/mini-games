import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { el, t } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { ENEMY_COLOR } from '../../src/data/colors.ts';
import { ENEMY_KINDS } from '../../src/data/enemies.ts';
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

// Runs frames until `done` says so, and fails when it never does, saying what the page was in (`what`).
async function until(done: () => boolean, tries = 240, what = (): string => ''): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} frames ${what()}`);
}

// The mesh of every kind; a wave of mixed kinds draws into more than one of them.
const enemyMeshes = (): THREE.Object3D[] =>
  scene.children.filter(child => ENEMY_KINDS.some(kind => child.name === enemyMeshName(kind)));

// How many enemies the scene draws across every kind's mesh.
const drawnEnemies = (): number => enemyMeshes().reduce((sum, mesh) => sum + (mesh as THREE.InstancedMesh).count, 0);

test('an enemy’s bullet that takes the last armour shows the result with the downed heading', async () => {
  startSortie();
  // The landing cutscene starts on the first step, and no hit takes armour while it plays: a bullet that has not reached
  // the mech in the first frame (a short frame on a busy machine) would hit during it and change nothing. So the
  // cutscene is skipped before the bullet is put out.
  await frame();
  sendToScript(game(), { kind: 'skip' });
  await frame();
  const current = game();
  expect(current.script.cutscene).toBeNull();
  current.armor = 1;
  const y = current.mech.y + MECH_TUNE.chestHeight;
  current.bullets.push({ enemy: 'grunt', x: current.mech.x, y, z: current.mech.z - 5, dx: 0, dy: 0, dz: 1, left: 50 });
  await until(
    () => state === 'result',
    240,
    () => `state ${state}, armour ${current.armor}, cutscene ${current.script.cutscene?.id ?? 'none'}`,
  );
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
  expect(enemyMeshes()).toHaveLength(ENEMY_KINDS.length);
  expect(drawnEnemies()).toBe(0);
  sendToScript(game(), { kind: 'enter', area: 'b-line' });
  await frame();
  // the squad and the six nests
  expect(game().enemies).toHaveLength(12);
  expect(enemyMeshes()).toHaveLength(ENEMY_KINDS.length);
  expect(drawnEnemies()).toBe(12);

  startSortie();
  await frame();
  expect(
    enemyMeshes()
      .map(mesh => mesh.name)
      .sort(),
  ).toEqual(ENEMY_KINDS.map(enemyMeshName).sort());
  expect(drawnEnemies()).toBe(0);
});

const colorAt = new THREE.Color();

test('every kind keeps room for its instance colours, so the GPU can draw it', async () => {
  startSortie();
  await frame();
  sendToScript(game(), { kind: 'enter', area: 'b-line' });
  await frame();
  expect(drawnEnemies()).toBe(12);
  for (const kind of ENEMY_KINDS) {
    const mesh = scene.getObjectByName(enemyMeshName(kind)) as THREE.InstancedMesh;
    expect(mesh.count, kind).toBeGreaterThan(0);
    // three r128 makes instanceColor inside the first setColorAt, with the count at that moment. A mesh built with count
    // 0 would keep an empty buffer, and the GPU would read past its end: nothing of that kind would be drawn.
    const colors = mesh.instanceColor;
    if (colors === null) throw new Error(`${kind} has no instance colours`);
    expect(colors.array.length, `${kind} colour room`).toBe((mesh.instanceMatrix.array.length / 16) * 3);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getColorAt(i, colorAt);
      expect(colorAt.getHex(), `${kind} ${i}`).toBe(ENEMY_COLOR[kind]);
    }
  }
});
