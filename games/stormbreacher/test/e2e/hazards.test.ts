import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { el, t } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { SHELL_RING_LIFT, MINE_MESH_NAME, SHELL_MESH_NAME } from '../../src/view/hazards.ts';
import { steps } from './steps.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// The tests share one page: each starts the sortie again directly.
beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

const meshes = (name: string): THREE.InstancedMesh[] =>
  scene.children.filter((child): child is THREE.InstancedMesh => child.name === name);

test('the mines are drawn as one mesh, and starting again leaves one', async () => {
  startSortie();
  steps(1);
  expect(meshes(MINE_MESH_NAME)).toHaveLength(1);
  expect(meshes(MINE_MESH_NAME)[0].count).toBe(game().mines.length);
  expect(game().mines.length).toBeGreaterThan(0);
  startSortie();
  steps(1);
  expect(meshes(MINE_MESH_NAME)).toHaveLength(1);
  expect(meshes(SHELL_MESH_NAME)).toHaveLength(1);
});

test('a warned shell is drawn as a ring and the HUD warns inside it, and both go once it lands', async () => {
  startSortie();
  const current = game();
  steps(1);
  const warning = el('#sbPlayHud [data-hud="warning"]');
  expect(warning.hidden).toBe(true);
  expect(meshes(SHELL_MESH_NAME)[0].count).toBe(0);
  // a shell on the mech, a long way from landing
  current.shells.push({ x: current.mech.x, z: current.mech.z, radius: 7, warn: 2.5, left: 2.5, damage: 25 });
  steps(1);
  expect(meshes(SHELL_MESH_NAME)[0].count).toBe(1);
  expect(warning.hidden).toBe(false);
  expect(warning.textContent).toBe(t('hud.warn.shell'));
  // a shell off to the side does not warn
  current.shells[0].x += 40;
  steps(1);
  expect(meshes(SHELL_MESH_NAME)[0].count).toBe(1);
  expect(warning.hidden).toBe(true);
  current.shells.length = 0;
  steps(1);
  expect(meshes(SHELL_MESH_NAME)[0].count).toBe(0);
});

test('a warned shell on the seawall is drawn on the wall’s top, not inside it', async () => {
  startSortie();
  const current = game();
  steps(1);
  // the mech's stand on the seawall (z -75..-65) is 6 m up; a ring left on the ground would sit inside the wall
  current.shells.push({ x: 35, z: -70, radius: 6, warn: 2, left: 2, damage: 0 });
  steps(1);
  const matrix = new THREE.Matrix4();
  meshes(SHELL_MESH_NAME)[0].getMatrixAt(0, matrix);
  const at = new THREE.Vector3().setFromMatrixPosition(matrix);
  expect(at.x).toBeCloseTo(35, 5);
  expect(at.z).toBeCloseTo(-70, 5);
  expect(at.y).toBeCloseTo(6 + SHELL_RING_LIFT, 5);
});

test('a warned shell keeps room for its instance colour, so the GPU can draw it', async () => {
  startSortie();
  const current = game();
  steps(1);
  current.shells.push({ x: current.mech.x, z: current.mech.z, radius: 7, warn: 2.5, left: 2.5, damage: 25 });
  steps(1);
  const mesh = meshes(SHELL_MESH_NAME)[0];
  expect(mesh.count).toBe(1);
  // The room covers every copy the mesh may draw, so the GPU finds a colour for each one.
  const colors = mesh.instanceColor;
  if (colors === null) throw new Error('the shells have no instance colours');
  expect(colors.array.length, 'shell colour room').toBe((mesh.instanceMatrix.array.length / 16) * 3);
});

test('a mine that goes off is no longer drawn', async () => {
  startSortie();
  const current = game();
  steps(1);
  const before = meshes(MINE_MESH_NAME)[0].count;
  const mine = current.mines[0];
  current.mech.x = mine.x;
  current.mech.z = mine.z;
  steps(2);
  expect(current.mines).toHaveLength(before - 1);
  expect(meshes(MINE_MESH_NAME)[0].count).toBe(before - 1);
});
