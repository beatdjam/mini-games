// A ramp is walked up and down smoothly: its surface climbs in a straight line under the mech (no step-like jumps), and
// the mech reaches the seawall's top on the way up and the ground on the way down.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import { MOVE_TUNE } from '../../src/data/tune.ts';
import { step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
const ramps = M1B_HAND.props.filter(prop => prop.kind === 'ramp');
const slope = Math.atan2(PROP_SIZE.ramp.h, PROP_SIZE.ramp.d);
// the most the surface may rise or fall in one frame at walking speed, with a little room for the solver's ordering
const MAX_STEP = MOVE_TUNE.walk * DT * Math.tan(slope) + 0.01;

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

// The hand map without its mines, so the walk does not set one off.
function newBeachGame(): GameModel {
  return newPlayGame({ ...M1B_HAND, mines: [] });
}

test('the mech walks up a ramp smoothly and into the seawall-top place', () => {
  expect(ramps.length).toBeGreaterThan(0);
  for (const ramp of ramps) {
    const game = newBeachGame();
    game.mech.x = ramp.x;
    game.mech.z = -45;
    game.mech.yaw = 0;
    let before = game.mech.y;
    let rise = 0;
    for (let i = 0; i < 400 && !game.script.entered.includes('seawall-top'); i++) {
      step(game, { ...idle, moveZ: 1 }, DT);
      rise = Math.max(rise, game.mech.y - before);
      before = game.mech.y;
    }
    expect(game.script.entered, `ramp at x ${ramp.x}`).toContain('seawall-top');
    expect(game.mech.y, `ramp at x ${ramp.x}`).toBeCloseTo(PROP_SIZE.seawall.h, 2);
    expect(rise, `ramp at x ${ramp.x}`).toBeLessThanOrEqual(MAX_STEP);
  }
});

test('the mech walks down a ramp smoothly to the ground', () => {
  for (const ramp of ramps) {
    const game = newBeachGame();
    game.mech.x = ramp.x;
    game.mech.z = -68;
    game.mech.y = PROP_SIZE.seawall.h;
    game.mech.yaw = 0;
    let before = game.mech.y;
    let drop = 0;
    for (let i = 0; i < 400 && game.mech.z < -44; i++) {
      step(game, { ...idle, moveZ: -1 }, DT);
      drop = Math.max(drop, before - game.mech.y);
      before = game.mech.y;
    }
    expect(game.mech.z, `ramp at x ${ramp.x}`).toBeGreaterThanOrEqual(-44);
    expect(game.mech.y, `ramp at x ${ramp.x}`).toBeCloseTo(0, 2);
    expect(drop, `ramp at x ${ramp.x}`).toBeLessThanOrEqual(MAX_STEP);
  }
});
