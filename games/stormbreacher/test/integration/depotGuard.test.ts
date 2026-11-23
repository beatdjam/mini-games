// The depot's guard on its new hollow under the right cliff (SB-1820): the four enemies of `depot-guard` stand round the
// depot, and the wave comes out once the mech walks into `depot-approach` after the leader's question. Walked with
// inputs.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { TARGET_SIZE } from '../../src/data/props.ts';
import type { MapDef } from '../../src/data/types.ts';
import { rectDistance } from '../../src/logic/collide.ts';
import { openBreach } from '../../src/logic/blasts.ts';
import { sendToScript, step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { hudModel } from '../../src/logic/hud.ts';
import { validateMapForMission } from '../../src/logic/mapCheck.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
const ARRIVE = 0.6; // a waypoint counts as reached within this (m)
const AT_DEPOT = 6; // the mech's middle this near the depot's edge has come to it (m)

const idle: GameInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
  sub: false,
};

// The way from the mech's start to the depot with no shot fired: out of the beach through line 1's breakthrough at
// x 40, along between the cover to line 2's breakthrough at x -10, then across and down the right side to the hollow.
const WAY_TO_DEPOT = [
  { x: 42, z: 156 },
  { x: 40, z: 135 },
  { x: 40, z: 116 },
  { x: -10, z: 116 },
  { x: -10, z: 56 },
  { x: 40, z: 44 },
  { x: 61, z: 36 },
  { x: 61, z: 29 },
  { x: 61, z: 4 },
  { x: 68, z: -8 },
  { x: 75, z: -20 },
  { x: 75, z: -30 },
];

// The hand map without its mines, so a walk does not set one off, and with the holes line 1 and line 2 need for the way:
// the mech blows those two points open on its way in. The nests are taken out too, since this is a walk about the
// depot's guard and they would shoot the mech on the way.
function newWalkGame(map: MapDef = openBreach({ ...M1B_HAND, mines: [] }, ['l1-b', 'l2-a'])): GameModel {
  const spawns = { ...map.spawns };
  delete spawns['b-emplacements'];
  const game = newPlayGame({ ...map, spawns });
  game.mech.yaw = 0;
  return game;
}

// Takes cp1 and waits for the leader's question (10 s), so `depot-go` can fire; the waves already out are cleared, as
// this walk is about the depot's guard.
function toAsked(game: GameModel): void {
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(item => item.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
  for (let i = 0; i < 60 * 11; i++) step(game, idle, DT);
  game.enemies = [];
  game.barrages = [];
  game.shells = [];
}

// Walks forward, facing the waypoint each frame, until the mech's middle is within ARRIVE of it.
function walkTo(game: GameModel, x: number, z: number): void {
  for (let i = 0; i < 1200; i++) {
    const dx = x - game.mech.x;
    const dz = z - game.mech.z;
    if (Math.hypot(dx, dz) < ARRIVE) return;
    game.mech.yaw = Math.atan2(-dx, -dz);
    step(game, { ...idle, moveZ: 1 }, DT);
  }
  throw new Error(`the mech did not reach (${x}, ${z}); it stands at (${game.mech.x}, ${game.mech.z})`);
}

function waveEnemies(game: GameModel, wave: string) {
  return game.enemies.filter(enemy => enemy.wave === wave);
}

test('the hand map holds the depot’s guard and passes the check against M1', () => {
  // the third pillbox is gone (SB-2023): the objective's two are the only pillboxes
  expect(M1B_HAND.targets.map(target => target.id)).not.toContain('pillbox-3');
  expect(M1.targets).not.toContain('pillbox-3');
  const violations = validateMapForMission(M1B_HAND, M1, {
    waves: ['beach-mortar', 'shelling', 'yard-1', 'yard-2', 'yard-3', 'battery'],
  });
  expect(violations).toEqual([]);
});

test('walking into the hollow after the question puts out the guard’s four in the wave’s order and kind', () => {
  const game = newWalkGame();
  toAsked(game);
  const places = M1B_HAND.spawns['depot-guard'];
  for (const way of WAY_TO_DEPOT) {
    const entered = game.script.entered.includes('depot-approach');
    expect(waveEnemies(game, 'depot-guard'), `before (${way.x}, ${way.z})`).toHaveLength(entered ? 4 : 0);
    walkTo(game, way.x, way.z);
  }
  expect(game.script.entered).toContain('depot-approach');
  const guard = waveEnemies(game, 'depot-guard');
  expect(guard).toHaveLength(4);
  expect(guard.map(enemy => enemy.kind)).toEqual(['grunt', 'grunt', 'grunt', 'emplacement']);
  expect(guard.length).toBe(places.length);

  // the mech came to the depot's side without a shot
  const depot = M1B_HAND.targets.find(target => target.id === 'depot');
  if (!depot) throw new Error('the hand map has no depot');
  const size = TARGET_SIZE[depot.kind];
  const rect = { x: depot.x, z: depot.z, halfW: size.w / 2, halfD: size.d / 2, yaw: depot.yaw };
  expect(rectDistance(rect, game.mech.x, game.mech.z)).toBeLessThan(AT_DEPOT);
});

test('the guard comes out once, when the mech walks into the hollow after the question', () => {
  const game = newWalkGame();
  toAsked(game);
  game.mech.x = 55;
  game.mech.z = -40;
  step(game, idle, DT);
  expect(waveEnemies(game, 'depot-guard')).toHaveLength(0);
  game.mech.x = 65;
  step(game, idle, DT);
  expect(waveEnemies(game, 'depot-guard')).toHaveLength(4);
  game.mech.x = 55;
  step(game, idle, DT);
  game.mech.x = 65;
  step(game, idle, DT);
  expect(waveEnemies(game, 'depot-guard')).toHaveLength(4);
});

test('every pillbox target of the map has a blast point, so each one can be broken', () => {
  const pillboxes = M1B_HAND.targets.filter(target => target.kind === 'pillbox');
  expect(pillboxes.length).toBeGreaterThan(0);
  for (const pillbox of pillboxes) {
    const points = (M1B_HAND.blasts ?? []).filter(blast => blast.target === pillbox.id);
    expect(points.length, `${pillbox.id} has no blast point`).toBeGreaterThan(0);
  }
  // and the objective counts exactly these
  const game = newWalkGame();
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  expect(hudModel(game).objective).toEqual({
    key: 'obj.break-pillboxes',
    count: { done: 0, total: pillboxes.length },
  });
});
