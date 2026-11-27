import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { step, type GameEvent, type GameInput } from '../../src/logic/game.ts';
import { seed } from '../../src/logic/rng.ts';
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

test('aiming at a point turns the mech to it and sends the shot that way', () => {
  seed(7);
  const game = newPlayGame(M1B_HAND);
  const aimAt = { x: game.mech.x + 20, z: game.mech.z };
  const shots: Extract<GameEvent, { kind: 'shot' }>[] = [];
  for (let i = 0; i < 30; i++) {
    step(game, { ...idle, fire: true, aimAt }, DT);
    for (const event of game.events) if (event.kind === 'shot') shots.push(event);
  }
  expect(game.mech.yaw).toBeCloseTo(-Math.PI / 2, 2);
  expect(shots.length).toBeGreaterThan(0);
  expect(shots[0].dx).toBeGreaterThan(0);
});

test('an aim point too near the mech leaves the yaw alone', () => {
  seed(7);
  const game = newPlayGame(M1B_HAND);
  const aimAt = { x: game.mech.x + 0.5, z: game.mech.z };
  for (let i = 0; i < 10; i++) step(game, { ...idle, aimAt }, DT);
  expect(game.mech.yaw).toBe(0);
});

test('with no aim point, a held face keeps the yaw and the shot along it', () => {
  seed(7);
  const game = newPlayGame({ ...M1B_HAND, targets: [], mines: [] });
  game.mech.x = 0;
  game.mech.z = 166;
  game.mech.yaw = 0;
  const yaw = game.mech.yaw;
  const shots: Extract<GameEvent, { kind: 'shot' }>[] = [];
  for (let i = 0; i < 10; i++) {
    // the turn key alone would swing the mech; the face holds the yaw the cursor aim gives when there is no point
    step(game, { ...idle, turn: 1, face: yaw, fire: true }, DT);
    for (const event of game.events) if (event.kind === 'shot') shots.push(event);
  }
  expect(game.mech.yaw).toBeCloseTo(yaw, 9);
  expect(shots.length).toBeGreaterThan(0);
  expect(shots[0].dz).toBeLessThan(-0.99);
  expect(Math.abs(shots[0].dx)).toBeLessThan(Math.abs(shots[0].dz) * 0.1);
});
