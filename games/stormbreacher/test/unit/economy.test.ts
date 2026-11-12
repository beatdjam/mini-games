import { describe, expect, test } from 'vitest';
import { AMMO_COST, ECONOMY, M1_MECH_REPAIR_FULL, MISSION_ECONOMY } from '../../src/data/economy.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { payoutOf } from '../../src/logic/economy.ts';
import { newGame, type GameModel } from '../../src/logic/game.ts';

const M1 = MISSION_ECONOMY.m1;
const AMMO = AMMO_COST.autocannon + AMMO_COST.heavyGun;

// A cleared game: the depot standing, the clock past the par time and one retry, so no bonus is earned until a test asks.
function cleared(change: (game: GameModel) => void = () => {}): GameModel {
  const game = newGame(M1B_HAND);
  game.cleared = true;
  game.time = M1.parTimeSec + 1;
  game.retries = 1;
  change(game);
  return game;
}

describe('payoutOf', () => {
  test('the base reward less the ammo and the retry, with no bonus and no damage', () => {
    const pay = payoutOf(cleared(), false);
    expect(pay.base).toBe(10000);
    expect(pay.ammo).toBe(800);
    expect(pay.repair).toBe(0);
    expect(pay.retryCost).toBe(2300);
    expect(pay.net).toBe(10000 - 800 - 2300);
    expect(pay.credited).toBe(true);
  });

  test('the depot bonus is earned by the script flag', () => {
    const pay = payoutOf(
      cleared(game => game.script.flags.push('depot-down')),
      false,
    );
    expect(pay.bonuses.depot).toEqual({ earned: true, amount: 2000 });
    expect(pay.bonuses.par.earned).toBe(false);
    expect(pay.net).toBe(10000 + 2000 - 800 - 2300);
    expect(payoutOf(cleared(), false).bonuses.depot.earned).toBe(false);
  });

  test('the par bonus is earned at the par time and not a moment after', () => {
    expect(
      payoutOf(
        cleared(game => (game.time = 720)),
        false,
      ).bonuses.par.earned,
    ).toBe(true);
    expect(
      payoutOf(
        cleared(game => (game.time = 720.1)),
        false,
      ).bonuses.par.earned,
    ).toBe(false);
    expect(
      payoutOf(
        cleared(game => (game.time = 600)),
        false,
      ).bonuses.par.amount,
    ).toBe(1000);
  });

  test('the no-retry bonus is earned only with no retry, and the retry cost is charged for each', () => {
    const none = payoutOf(
      cleared(game => (game.retries = 0)),
      false,
    );
    expect(none.bonuses.noRetry).toEqual({ earned: true, amount: 1000 });
    expect(none.retryCost).toBe(0);
    const three = payoutOf(
      cleared(game => (game.retries = 3)),
      false,
    );
    expect(three.bonuses.noRetry.earned).toBe(false);
    expect(three.retries).toBe(3);
    expect(three.retryCost).toBe(3 * (AMMO + M1_MECH_REPAIR_FULL));
    expect(three.net).toBe(10000 - 800 - 6900);
  });

  test('the repair is in proportion to the armour lost and rounded to the unit', () => {
    const lost = (n: number) =>
      payoutOf(
        cleared(game => (game.armor = MECH_TUNE.armor - n)),
        false,
      ).repair;
    expect(lost(MECH_TUNE.armor)).toBe(1500);
    expect(lost(MECH_TUNE.armor / 2)).toBe(750);
    // 1 of 200 is 7.5 cr, which rounds to 10
    expect(lost(1)).toBe(10);
    // 3 of 200 is 22.5 cr, which rounds to 20
    expect(lost(3)).toBe(20);
    expect(lost(0)).toBe(0);
    expect(lost(1) % ECONOMY.roundTo).toBe(0);
  });

  test('the take-home never goes below the floor', () => {
    const pay = payoutOf(
      cleared(game => (game.retries = 20)),
      false,
    );
    expect(pay.net).toBe(ECONOMY.rewardFloor);
  });

  test('a mission cleared before is not credited, but the breakdown is the same', () => {
    const first = payoutOf(cleared(), false);
    const again = payoutOf(cleared(), true);
    expect(again.credited).toBe(false);
    expect(again.net).toBe(first.net);
  });

  test('a mission with no economy throws', () => {
    const game = cleared();
    game.mission = { ...game.mission, id: 'nope' };
    expect(() => payoutOf(game, false)).toThrow();
  });
});
