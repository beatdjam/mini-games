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

// The battle's infantry bodies, named in parts.ts so the test can read how many are drawn. The near and far forms are
// separate meshes (SB-2085); a soldier is written into one of them only.
function battleBodies(): THREE.InstancedMesh[] {
  const group = battleGroups()[0];
  const bodies: THREE.InstancedMesh[] = [];
  for (const name of ['sb-battle-bodies', 'sb-battle-bodies-far']) {
    const mesh = group.getObjectByName(name);
    if (mesh instanceof THREE.InstancedMesh) bodies.push(mesh);
  }
  if (bodies.length === 0) throw new Error('the battle has no soldier bodies');
  return bodies;
}

function battleSoldierCount(bodies: readonly THREE.InstancedMesh[]): number {
  return bodies.reduce((sum, mesh) => sum + mesh.count, 0);
}

// One number from the drawn soldiers' places: a frame that moved any of them changes it.
function battleBodiesPlacement(bodies: readonly THREE.InstancedMesh[]): number {
  const matrix = new THREE.Matrix4();
  let sum = 0;
  for (const mesh of bodies) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      sum += matrix.elements[12] * 1000 + matrix.elements[14];
    }
  }
  return sum;
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
  expect(battleSoldierCount(bodies)).toBe(0);
  for (let i = 0; i < 120; i++) runSystems(1 / 60);
  await frames(1);
  expect(battleSoldierCount(bodies)).toBe(0);
  // the first controlled frame steps the battle and draws the first wave
  sendToScript(game(), { kind: 'skip' });
  runSystems(1 / 60);
  await frames(1);
  expect(battleSoldierCount(bodies)).toBeGreaterThan(0);
});

test('the battlefield runs while the wave 2 cutscene plays', async () => {
  startSortie();
  await frames(3);
  sendToScript(game(), { kind: 'skip' });
  // both pillboxes down fires cp1; wave2-lost starts the cutscene 4 s later
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game().targets.find(entry => entry.id === id);
    if (target) target.hp = 0;
    sendToScript(game(), { kind: 'destroyed', target: id });
  }
  for (let i = 0; i < 60 * 5 && game().script.cutscene === null; i++) runSystems(1 / 60);
  expect(game().script.cutscene?.id).toBe('wave2-sinks');
  await frames(1);
  const bodies = battleBodies();
  expect(battleSoldierCount(bodies)).toBeGreaterThan(0);
  const before = battleBodiesPlacement(bodies);
  // half a second into the cutscene the infantry has moved on (the landing is the one that holds it still)
  for (let i = 0; i < 30; i++) runSystems(1 / 60);
  await frames(1);
  expect(game().script.cutscene?.id).toBe('wave2-sinks');
  expect(battleBodiesPlacement(bodies)).not.toBe(before);
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

test("advancing to the next waiting line starts the held line's growing loss over", () => {
  const battle = buildBattle(M1B_HAND, PLAY_BATTLE_TUNE, stream('battle'), stream('craters'), { x: 0, z: 166 }, null);
  battle.advance(150, 0);
  battle.crowd.holdT = 20; // the line has waited a long while
  battle.advance(122, 0);
  expect(battle.crowd.holdT).toBe(0);
  battle.dispose();
});

test('starting again builds the battle anew, and leaves one', async () => {
  startSortie();
  await frames(2);
  startSortie();
  await frames(2);
  expect(battleGroups()).toHaveLength(1);
});

test('the landing shows the five allies on their decks, and the handover starts them down their ramps', async () => {
  startSortie();
  await frames(3);
  // the five are aboard the crafts beside the player's from the intro and stand on their decks through the cutscene
  expect(game().allies).toHaveLength(5);
  expect(allyGroups()).toHaveLength(10);
  const buddy = () => game().allies.find(ally => ally.id === 'buddy');
  const before = buddy()?.z ?? 0;
  sendToScript(game(), { kind: 'skip' });
  await frames(2);
  expect(game().allies).toHaveLength(5);
  expect(allyGroups()).toHaveLength(10);
  // the handover alone sends them down their ramps; no `ashore` input and the mech still on the deck
  expect(game().mech.z).toBeGreaterThan(M1B_HAND.bounds.maxZ);
  expect(buddy()?.z).toBeLessThan(before);
  expect(allyGroups().filter(group => group.userData.allyId === 'gunner')).toHaveLength(2);
  const buddyGroups = allyGroups().filter(group => group.userData.allyId === 'buddy');
  expect(buddyGroups).toHaveLength(2);
  const [run, wreck] = buddyGroups;
  expect(run.visible).toBe(true);
  expect(wreck.visible).toBe(false);
  // Run the page's own frame by hand until the mortar takes it. A frame moves the ally 9 * dt metres: the page's frames
  // are capped at LOOP.maxDt (0.05 s, under 0.5 m), but a 1 s step moves it 9 m, enough to pass over the place it falls
  // at and end farther than ALLY_TUNE.arrive from it, so the fall is never seen.
  for (let i = 0; i < 600 && buddy()?.down !== true; i++) runSystems(1 / 60);
  await frames(2);
  expect(buddy()?.down).toBe(true);
  expect(run.visible).toBe(false);
  expect(wreck.visible).toBe(true);

  // entering B wakes the pillboxes but brings out no more allies: the gunner came with the beach and waits by line 1
  game().mech.x = 0;
  game().mech.z = 140;
  step(game(), IDLE, 0.1);
  await frames(2);
  expect(game().allies).toHaveLength(5);
  expect(allyGroups()).toHaveLength(10);
});
