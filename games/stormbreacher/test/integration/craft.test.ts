// The mech walks on the player's craft: up the ramp from the sand, along the deck without leaving it over the side, and
// back down the ramp, and it cannot pass the map's front edge outside the ramp's lane.
import { expect, test } from 'vitest';
import { CRAFT_TUNE } from '../../src/data/craft.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { newGame, sendToScript, step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { craftRects } from '../../src/logic/craft.ts';
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

// The game past the landing with the mech on the deck, where a new game puts it. The beach's hazards are left out so the
// tests read the craft's boxes alone.
function onDeck(): GameModel {
  const game = newGame(M1B_HAND);
  step(game, idle, 0);
  sendToScript(game, { kind: 'skip' });
  game.barrages = [];
  game.aimed = null;
  game.events = [];
  return game;
}

// The game past the landing with the mech on the sand at (0, 166), facing the land.
function onSand(): GameModel {
  const game = newPlayGame(M1B_HAND);
  game.barrages = [];
  game.aimed = null;
  game.events = [];
  return game;
}

// Walks with `input` for `frames` frames.
function walk(game: GameModel, frames: number, input: GameInput): void {
  for (let i = 0; i < frames; i++) step(game, input, DT);
}

test('the mech walks up the ramp from the sand and stands on the deck', () => {
  const game = onSand();
  expect(game.mech.z).toBeCloseTo(166, 6);
  // face the sea (+z) and walk forward up the ramp
  game.mech.yaw = Math.PI;
  walk(game, 240, { ...idle, moveZ: 1 });
  expect(game.mech.y).toBeCloseTo(1.8, 2);
  expect(game.mech.z).toBeGreaterThan(175);
  expect(game.mech.grounded).toBe(true);
});

test('outside the ramp’s lane the mech stops at the map’s front edge', () => {
  const game = onSand();
  game.mech.x = 20;
  game.mech.yaw = Math.PI;
  walk(game, 240, { ...idle, moveZ: 1 });
  expect(game.mech.z).toBeLessThanOrEqual(M1B_HAND.bounds.maxZ - MECH_TUNE.radius + 1e-6);
  expect(game.mech.y).toBe(0);
});

test('the deck’s side wall keeps the mech from walking off into the sea', () => {
  const game = onDeck();
  const startZ = game.mech.z;
  // the wall's inner face, from the same boxes the walking uses, and the mech's radius back from it
  const cx = (M1B_HAND.bounds.minX + M1B_HAND.bounds.maxX) / 2;
  const rightWall = craftRects(M1B_HAND.bounds).find(
    rect => rect.x > cx && rect.top === CRAFT_TUNE.hullTop + CRAFT_TUNE.wallHeight,
  );
  if (!rightWall) throw new Error('the craft has no right side wall');
  const expected = rightWall.x - rightWall.halfW - MECH_TUNE.radius - cx;
  // face +x and walk into the side wall
  game.mech.yaw = -Math.PI / 2;
  walk(game, 120, { ...idle, moveZ: 1 });
  expect(game.mech.x).toBeCloseTo(expected, 2);
  expect(game.mech.y).toBeCloseTo(1.8, 3);
  expect(game.mech.z).toBeCloseTo(startZ, 3);
});

test('the mech walks down the ramp from the deck and reaches the sand', () => {
  const game = onDeck();
  // face the land (-z) and walk forward
  game.mech.yaw = 0;
  walk(game, 300, { ...idle, moveZ: 1 });
  expect(game.mech.z).toBeLessThan(M1B_HAND.bounds.maxZ);
  expect(game.mech.y).toBeCloseTo(0, 2);
  expect(game.mech.grounded).toBe(true);
});
