import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { runSystems } from '@engine/core/index.ts';
import { drawStats, scene } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { PLAY_BATTLE_TUNE } from '../../src/data/tune.ts';
import { ALLY_MESH_NAME } from '../../src/view/allies.ts';
import { BATTLE_GROUP_NAME, buildBattle } from '../../src/view/battle/index.ts';
import { sendToScript, step, type GameInput } from '../../src/logic/game.ts';
import { stream } from '../../src/logic/rng.ts';
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

// The battle's infantry bodies, named in parts.ts so the test can read how many are drawn.
function battleBodies(): THREE.InstancedMesh {
  const bodies = battleGroups()[0].getObjectByName('sb-battle-bodies');
  if (!(bodies instanceof THREE.InstancedMesh)) throw new Error('the battle has no soldier bodies');
  return bodies;
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
  expect(drawn.filter(mesh => mesh.count >= PLAY_BATTLE_TUNE.allies / 2).length).toBeGreaterThanOrEqual(2);
  expect(drawn.length).toBeGreaterThanOrEqual(5);
  console.log(`sortie after the cutscene: ${drawStats()}`);
});

test('the battlefield holds still during the landing and starts when the controls do', async () => {
  startSortie();
  await frames(3);
  const bodies = battleBodies();
  // the landing's frames do not move the infantry: it starts at the sea edge and is not drawn yet
  expect(bodies.count).toBe(0);
  for (let i = 0; i < 120; i++) runSystems(1 / 60);
  await frames(1);
  expect(bodies.count).toBe(0);
  // the first controlled frame steps the battle and draws the first wave
  sendToScript(game(), { kind: 'skip' });
  runSystems(1 / 60);
  await frames(1);
  expect(bodies.count).toBeGreaterThan(0);
});

test('a blast of the game takes the soldiers near it', () => {
  const tune = {
    ...PLAY_BATTLE_TUNE,
    shellEvery: 0,
    squadFallRadius: 0,
    squadFallShare: 0,
    allyDeathRate: 0,
    shellFallRadius: 10,
    shellFallShare: 1,
  };
  const battle = buildBattle(M1B_HAND, tune, stream('battle'), stream('craters'), { x: 0, z: 166 }, null);
  const soldier = battle.crowd.soldiers[0];
  if (!soldier) throw new Error('the battle put out no soldier');
  const before = battle.counts().fallen;
  battle.blast(soldier.x, soldier.z);
  expect(battle.counts().fallen).toBeGreaterThan(before);
  expect(soldier.alive).toBe(false);
  battle.dispose();
});

test('starting again builds the battle anew, and leaves one', async () => {
  startSortie();
  await frames(2);
  startSortie();
  await frames(2);
  expect(battleGroups()).toHaveLength(1);
});

test('the cutscene shows no ally, and the ashore input puts them out and then lies them down', async () => {
  startSortie();
  await frames(3);
  // the beach's allies wait until the mech has left the craft
  expect(game().allies).toHaveLength(0);
  expect(allyGroups()).toHaveLength(0);
  sendToScript(game(), { kind: 'skip' });
  await frames(2);
  expect(game().allies).toHaveLength(0);
  expect(allyGroups()).toHaveLength(0);
  sendToScript(game(), { kind: 'ashore' });
  await frames(2);
  expect(allyGroups()).toHaveLength(8);
  const buddyGroups = allyGroups().filter(group => group.userData.allyId === 'buddy');
  expect(buddyGroups).toHaveLength(2);
  const [run, wreck] = buddyGroups;
  expect(run.visible).toBe(true);
  expect(wreck.visible).toBe(false);
  // run the logic on until the mortar takes it; the page draws the next frame
  const buddy = () => game().allies.find(ally => ally.id === 'buddy');
  for (let i = 0; i < 20 && buddy()?.down !== true; i++) step(game(), IDLE, 1);
  await frames(2);
  expect(buddy()?.down).toBe(true);
  expect(run.visible).toBe(false);
  expect(wreck.visible).toBe(true);

  // entering B puts the gunner out as the fifth ally, the tenth group
  game().mech.x = 0;
  game().mech.z = 140;
  step(game(), IDLE, 0.1);
  await frames(2);
  expect(game().allies).toHaveLength(5);
  expect(allyGroups()).toHaveLength(10);
  expect(allyGroups().filter(group => group.userData.allyId === 'gunner')).toHaveLength(2);
});
