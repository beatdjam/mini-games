// The low walls on the beach and the stairs up the seawall (SB-120), walked with inputs: a low wall stops a walk and
// lets a jump over, a flight of stairs is walked up to the seawall's top and into M1's seawall-top place, and the
// ground in front of the seawall is not that place.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
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

const lowWall = M1B_HAND.props.filter(prop => prop.kind === 'lowWall')[0];
const stairs = M1B_HAND.props.filter(prop => prop.kind === 'stairs');

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

test('a flight of stairs is walked up to the seawall and into the seawall-top place', () => {
  for (const flight of stairs) {
    const game = newBeachGame();
    // in the breakthrough of the line before the seawall (between its two rows, z -50 and z -40), facing the stairs;
    // the walk goes straight through the line's last row and up the steps
    game.mech.x = flight.x;
    game.mech.z = -45;
    // up the steps and onto the seawall, stopping when the place is entered (the walk would go on and drop off the back)
    for (let i = 0; i < 300 && !game.script.entered.includes('seawall-top'); i++) {
      step(game, { ...idle, moveZ: 1 }, DT);
    }
    expect(game.mech.y, `flight at x ${flight.x}`).toBeCloseTo(PROP_SIZE.seawall.h, 2);
    const area = M1.areas['seawall-top'];
    expect(game.mech.z).toBeLessThan(area.z + area.d / 2);
    expect(game.script.entered).toContain('seawall-top');
    expect(game.checkpoint?.id).toBe('cp2');
  }
});

test('walking along the foot of the seawall does not enter the seawall-top place', () => {
  const game = newBeachGame();
  game.mech.x = 0;
  game.mech.z = -55;
  run(game, { ...idle, moveZ: 1 }, 300);
  const foot = -65 + MECH_TUNE.radius;
  expect(game.mech.z).toBeCloseTo(foot, 2);
  expect(game.mech.y).toBe(0);
  run(game, { ...idle, moveX: 1 }, 120);
  expect(game.script.entered).not.toContain('seawall-top');
  expect(game.checkpoint).toBeNull();
});

test('the hand map has a way from the beach to the seawall’s foot', () => {
  expect(checkMapPath(M1B_HAND)).toEqual([]);
});
