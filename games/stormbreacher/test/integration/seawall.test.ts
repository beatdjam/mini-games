// The low walls on the beach and the seawall either side of the fortress (SB-120), walked with inputs: a low wall stops a
// walk and a jump carries the mech over it, and the seawall's sea face is a wall the mech cannot climb now that M1 has no ramp.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { checkMapPath } from '../../src/logic/mapCheck.ts';
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

function run(game: GameModel, input: GameInput, frames: number): void {
  for (let i = 0; i < frames; i++) step(game, input, DT);
}

// The hand map without its mines, so a walk across the beach does not set one off.
function newBeachGame(): GameModel {
  const game = newPlayGame({ ...M1B_HAND, mines: [] });
  game.mech.yaw = 0;
  return game;
}

const lowWall = M1B_HAND.props.find(prop => prop.kind === 'lowWall' && prop.z > 0);
if (!lowWall) throw new Error('the hand map has no low wall on the beach');

test('walking into a low wall stops the mech in front of it', () => {
  const game = newBeachGame();
  game.mech.x = lowWall.x;
  game.mech.z = lowWall.z + 12;
  run(game, { ...idle, moveZ: 1 }, 240);
  const stop = lowWall.z + PROP_SIZE.lowWall.d / 2 + MECH_TUNE.radius;
  expect(game.mech.z).toBeCloseTo(stop, 2);
  expect(game.mech.y).toBe(0);
});

test('a jump takes the mech over a low wall', () => {
  const game = newBeachGame();
  game.mech.x = lowWall.x;
  game.mech.z = lowWall.z + 6;
  run(game, { ...idle, moveZ: 1 }, 20);
  run(game, { ...idle, moveZ: 1, jump: true, jumpHeld: true }, 1);
  run(game, { ...idle, moveZ: 1, jumpHeld: true }, 40);
  run(game, { ...idle, moveZ: 1 }, 120);
  expect(game.mech.z).toBeLessThan(lowWall.z - PROP_SIZE.lowWall.d / 2 - MECH_TUNE.radius);
});

test('the seawall’s sea face stops the mech, which cannot climb it without a ramp', () => {
  const game = newBeachGame();
  // beside the fortress, where the seawall stands; its seaward face is z -65
  game.mech.x = 60;
  game.mech.z = -55;
  run(game, { ...idle, moveZ: 1 }, 300);
  const foot = -65 + MECH_TUNE.radius;
  expect(game.mech.z).toBeCloseTo(foot, 2);
  expect(game.mech.y).toBe(0);
  run(game, { ...idle, moveX: 1 }, 120);
  expect(game.checkpoint).toBeNull();
});

test('the hand map has a way from the beach to the seawall’s foot', () => {
  expect(checkMapPath(M1B_HAND)).toEqual([]);
});
