import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { runSystems } from '@engine/core/index.ts';
import { drawStats, scene } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { FX_TUNE } from '../../src/data/tune.ts';
import { ALLY_MESH_NAME } from '../../src/view/allies.ts';
import { BATTLE_GROUP_NAME } from '../../src/view/battle/index.ts';
import { sendToScript, step, type GameInput } from '../../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frames = async (n: number): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
};

const IDLE: GameInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
  sub: false,
};

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

const battleGroups = (): THREE.Object3D[] => scene.children.filter(child => child.name === BATTLE_GROUP_NAME);

// The instanced meshes of the battle that are drawn: the ones with nothing to draw are hidden.
function drawnBattleMeshes(): THREE.InstancedMesh[] {
  const meshes: THREE.InstancedMesh[] = [];
  battleGroups()[0].traverse(object => {
    const mesh = object as THREE.InstancedMesh;
    if (mesh.isInstancedMesh === true && mesh.visible && mesh.count > 0) meshes.push(mesh);
  });
  return meshes;
}

// The ally's models: the instanced meshes named for it, by the group they sit in.
function allyGroups(): THREE.Group[] {
  return scene.children.filter((child): child is THREE.Group => child.name === ALLY_MESH_NAME);
}

test('a sortie draws the battle: the allies walking, the holes and the smoke, in one group', async () => {
  startSortie();
  await frames(3);
  sendToScript(game(), { kind: 'skip' });
  // 1.5 s of the battle, run by hand: waiting for 90 drawn frames timed out at 60 s on CI when every game's tests ran at
  // once. One drawn frame after it gives the draw counts.
  for (let i = 0; i < 90; i++) runSystems(1 / 60);
  await frames(1);
  expect(battleGroups()).toHaveLength(1);
  const drawn = drawnBattleMeshes();
  // the walkers' bodies and heads (some have fallen or gone by now), and the holes, the smoke and the rest
  expect(drawn.filter(mesh => mesh.count >= FX_TUNE.allies / 2).length).toBeGreaterThanOrEqual(2);
  expect(drawn.length).toBeGreaterThanOrEqual(5);
  console.log(`sortie after the cutscene: ${drawStats()}`);
});

test('starting again builds the battle anew, and leaves one', async () => {
  startSortie();
  await frames(2);
  startSortie();
  await frames(2);
  expect(battleGroups()).toHaveLength(1);
});

test('the cutscene shows no ally, and the ally runs and then lies down once the cutscene is over', async () => {
  startSortie();
  await frames(3);
  expect(game().allies).toHaveLength(1);
  expect(allyGroups()).toHaveLength(0);
  sendToScript(game(), { kind: 'skip' });
  await frames(2);
  const [run, wreck] = allyGroups();
  expect(allyGroups()).toHaveLength(2);
  expect(run.visible).toBe(true);
  expect(wreck.visible).toBe(false);
  // run the logic on until the mortar takes it; the page draws the next frame
  for (let i = 0; i < 20 && !game().allies[0].down; i++) step(game(), IDLE, 1);
  await frames(2);
  expect(game().allies[0].down).toBe(true);
  expect(run.visible).toBe(false);
  expect(wreck.visible).toBe(true);
});
