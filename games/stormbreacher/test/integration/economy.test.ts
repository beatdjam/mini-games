import { expect, test } from 'vitest';
import { AMMO_COST, M1_MECH_REPAIR_FULL } from '../../src/data/economy.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { payoutOf } from '../../src/logic/economy.ts';
import { restartGame, retryFromCheckpoint, sendToScript, step, type GameInput } from '../../src/logic/game.ts';
import { newPlayGame } from './playGame.ts';

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

const AMMO = AMMO_COST.autocannon + AMMO_COST.heavyGun;

function breakTarget(game: ReturnType<typeof newPlayGame>, id: string): void {
  const target = game.targets.find(t => t.id === id);
  if (!target) throw new Error(`the map has no ${id}`);
  target.hp = 0;
  sendToScript(game, { kind: 'destroyed', target: id });
}

test('a run that breaks the depot, takes damage and retries once is paid by the formula, with no bonus counted twice', () => {
  let game = newPlayGame(M1B_HAND);
  for (let i = 0; i < 60; i++) step(game, idle, 1 / 60);
  breakTarget(game, 'depot');
  breakTarget(game, 'pillbox-1');
  breakTarget(game, 'pillbox-2');
  expect(game.checkpoint?.id).toBe('cp1');
  game.armor = 0;
  game.downed = true;
  game = retryFromCheckpoint(game);
  expect(game.retries).toBe(1);
  // the depot's flag came back with the checkpoint
  expect(game.script.flags).toContain('depot-down');
  game.armor = MECH_TUNE.armor / 2;
  game.time = 500;
  game.cleared = true;
  const pay = payoutOf(game, false);
  expect(pay.bonuses.depot.earned).toBe(true);
  expect(pay.bonuses.par.earned).toBe(true);
  expect(pay.bonuses.noRetry.earned).toBe(false);
  expect(pay.repair).toBe(M1_MECH_REPAIR_FULL / 2);
  expect(pay.retryCost).toBe(AMMO + M1_MECH_REPAIR_FULL);
  expect(pay.net).toBe(10000 + 2000 + 1000 - AMMO - M1_MECH_REPAIR_FULL / 2 - (AMMO + M1_MECH_REPAIR_FULL));
});

test('retrying again and again does not earn the no-retry bonus, and a restart counts as a retry', () => {
  let game = newPlayGame(M1B_HAND);
  game.downed = true;
  game = restartGame(game);
  game.downed = false;
  game.cleared = true;
  game.time = 100;
  const pay = payoutOf(game, false);
  expect(pay.retries).toBe(1);
  expect(pay.bonuses.noRetry.earned).toBe(false);
  expect(pay.bonuses.depot.earned).toBe(false);
});

test('a run with no retry and no damage earns the no-retry bonus and no repair or retry cost', () => {
  const game = newPlayGame(M1B_HAND);
  game.cleared = true;
  game.time = 600;
  const pay = payoutOf(game, false);
  expect(pay.bonuses.noRetry.earned).toBe(true);
  expect(pay.repair).toBe(0);
  expect(pay.retryCost).toBe(0);
  expect(pay.net).toBe(10000 + 1000 + 1000 - AMMO);
});
