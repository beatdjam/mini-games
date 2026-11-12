// The depot's guard and C's reinforcement (SB-300): pillbox-3 and the three enemies of `depot-guard` stand round the
// depot on the side road, and `c-squad`'s four come out when the mech nears C. Walked with inputs.
import { expect, test } from 'vitest';
import { M1_WAVE_ENEMY } from '../../src/data/enemies.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { TARGET_SIZE } from '../../src/data/props.ts';
import type { MapDef } from '../../src/data/types.ts';
import { rectDistance } from '../../src/logic/collide.ts';
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
// x 40, along between the cover to line 2's breakthrough at x -10, and back across to the depot's road.
const WAY_TO_DEPOT = [
  { x: 42, z: 156 },
  { x: 40, z: 135 },
  { x: 40, z: 116 },
  { x: -10, z: 116 },
  { x: -10, z: 56 },
  { x: 40, z: 50 },
  { x: 46, z: 42 },
  { x: 50, z: 41 },
];

// The hand map without its mines, so a walk does not set one off.
function newWalkGame(map: MapDef = { ...M1B_HAND, mines: [] }): GameModel {
  const game = newPlayGame(map);
  game.mech.yaw = 0;
  return game;
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
  expect(M1B_HAND.targets.map(target => target.id)).toContain('pillbox-3');
  expect(M1.targets).toContain('pillbox-3');
  const violations = validateMapForMission(M1B_HAND, M1, { waves: ['beach-mortar', 'battery'] });
  expect(violations).toEqual([]);
});

test('walking to the depot enters depot-approach, which puts out the guard’s three in the wave’s order and kind', () => {
  const game = newWalkGame();
  const places = M1B_HAND.spawns['depot-guard'];
  for (const way of WAY_TO_DEPOT) {
    expect(waveEnemies(game, 'depot-guard'), `before (${way.x}, ${way.z})`).toHaveLength(
      game.script.entered.includes('depot-approach') ? 3 : 0,
    );
    walkTo(game, way.x, way.z);
  }
  expect(game.script.entered).toContain('depot-approach');
  const guard = waveEnemies(game, 'depot-guard');
  expect(guard).toHaveLength(3);
  expect(guard.map(enemy => enemy.kind)).toEqual(M1_WAVE_ENEMY['depot-guard']);
  expect(guard.length).toBe(places.length);

  // the mech came to the depot's side without a shot
  const depot = M1B_HAND.targets.find(target => target.id === 'depot');
  if (!depot) throw new Error('the hand map has no depot');
  const size = TARGET_SIZE[depot.kind];
  const rect = { x: depot.x, z: depot.z, halfW: size.w / 2, halfD: size.d / 2, yaw: depot.yaw };
  expect(rectDistance(rect, game.mech.x, game.mech.z)).toBeLessThan(AT_DEPOT);
});

test('the guard comes out once, and not before the mech is in depot-approach', () => {
  const game = newWalkGame();
  game.mech.x = 40;
  game.mech.z = 75;
  step(game, idle, DT);
  expect(waveEnemies(game, 'depot-guard')).toHaveLength(0);
  game.mech.z = 60;
  step(game, idle, DT);
  expect(waveEnemies(game, 'depot-guard')).toHaveLength(3);
  game.mech.z = 75;
  step(game, idle, DT);
  game.mech.z = 60;
  step(game, idle, DT);
  expect(waveEnemies(game, 'depot-guard')).toHaveLength(3);
});

test('pillbox-3 does not count toward the two pillboxes of the objective', () => {
  const game = newWalkGame();
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  expect(hudModel(game).objective).toEqual({ key: 'obj.break-pillboxes', count: { done: 0, total: 2 } });
  const pillbox3 = game.targets.find(target => target.id === 'pillbox-3');
  if (!pillbox3) throw new Error('the game has no pillbox-3');
  pillbox3.hp = 0;
  expect(hudModel(game).objective?.count).toEqual({ done: 0, total: 2 });
  expect(game.script.fired).not.toHaveProperty('cp1');
});

test('entering c-line puts out the four of c-squad between C’s two rows, in the wave’s order and kind, once', () => {
  const game = newWalkGame();
  game.mech.x = 0;
  game.mech.z = -20;
  step(game, idle, DT);
  expect(waveEnemies(game, 'c-squad')).toHaveLength(0);
  game.mech.z = -27;
  step(game, idle, DT);
  const squad = waveEnemies(game, 'c-squad');
  expect(squad).toHaveLength(4);
  expect(squad.map(enemy => enemy.kind)).toEqual(M1_WAVE_ENEMY['c-squad']);
  for (const enemy of squad) {
    expect(enemy.z).toBeLessThan(-40);
    expect(enemy.z).toBeGreaterThan(-50);
  }
  game.mech.z = -20;
  step(game, idle, DT);
  game.mech.z = -27;
  step(game, idle, DT);
  expect(waveEnemies(game, 'c-squad')).toHaveLength(4);
});
