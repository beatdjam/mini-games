// The jump's height on the hand map (TL-1250): the standard legs peak at about 2.2 m, and a hedgehog (3 m) stays a wall
// even when the mech jumps at it with the boost on, for the boost adds no upward speed.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import { step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;

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

// A full-sized hedgehog of line 2, found by its place rather than its index in the map.
function lineHedgehog(): { x: number; z: number } {
  const prop = M1B_HAND.props.find(item => item.kind === 'hedgehog' && item.x === 35 && item.z === 93.33);
  if (!prop) throw new Error('the hand map has the hedgehog at x 35, z 93.33');
  return prop;
}

// The hand map without its mines, so a walk across the beach does not set one off.
function newBeachGame(): GameModel {
  return newPlayGame({ ...M1B_HAND, mines: [] });
}

test('a jump peaks at 2.0 to 2.4 m and a hedgehog stays a wall even with the boost', () => {
  const hedgehog = lineHedgehog();
  const game = newBeachGame();
  game.mech.x = hedgehog.x;
  game.mech.z = hedgehog.z + 8;
  game.mech.yaw = 0;
  let peak = 0;
  for (let i = 0; i < 180; i++) {
    // jump into the hedgehog and hold the jump key and the boost through the flight
    step(game, { ...idle, moveZ: 1, jump: i === 0, jumpHeld: i < 120, boost: i < 120 }, DT);
    peak = Math.max(peak, game.mech.y);
  }
  expect(peak).toBeGreaterThanOrEqual(2.0);
  expect(peak).toBeLessThanOrEqual(2.4);
  expect(peak).toBeLessThan(PROP_SIZE.hedgehog.h);
  // still on the sea side of the hedgehog's near face, so the jump never crossed it
  expect(game.mech.z).toBeGreaterThan(hedgehog.z + PROP_SIZE.hedgehog.d / 2);
});
