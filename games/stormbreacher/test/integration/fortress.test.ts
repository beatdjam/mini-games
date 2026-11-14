// The fortress (SB-1800): its walls stand where FORTRESS_TUNE says and leave the sea and land gates open, the mech walks
// through both of them, and the map's own walking check is empty.
import { expect, test } from 'vitest';
import { FORTRESS_TUNE } from '../../src/data/fortress.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import type { MissionDef } from '../../src/data/types.ts';
import { step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { checkMapPath } from '../../src/logic/mapCheck.ts';
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

// The walk asks nothing of the script: this test is about the walls alone.
const MISSION: MissionDef = {
  id: 'fortress-test',
  cues: [],
  areas: {},
  targets: [],
  waves: [],
  objectives: [],
  marks: [],
  allies: [],
  paths: {},
  places: {},
};

test('the map’s walking check finds a way across the whole of M1B_HAND', () => {
  expect(checkMapPath(M1B_HAND)).toEqual([]);
});

test('the fortress walls stand where FORTRESS_TUNE says and leave the two gates open', () => {
  const walls = M1B_HAND.props.filter(prop => prop.kind === 'fortWall');
  // three pieces on each half of the two end walls, and four on each side wall
  expect(walls).toHaveLength(20);
  const halfW = PROP_SIZE.fortWall.w / 2;
  const halfD = PROP_SIZE.fortWall.d / 2;
  for (const wall of walls) {
    const across = wall.yaw === 0 ? halfW : halfD; // the piece's half-width along x
    expect(Math.abs(wall.x) + across).toBeLessThanOrEqual(FORTRESS_TUNE.outerW / 2);
    if (wall.yaw === 0) {
      // the end walls stand at the two edges of the box and leave the middle open for the gate
      expect(Math.abs(wall.z)).toBeGreaterThan(0);
      expect(wall.z === FORTRESS_TUNE.seaWallZ || wall.z === FORTRESS_TUNE.landWallZ).toBe(true);
      expect(Math.abs(wall.x) - across).toBeGreaterThanOrEqual(FORTRESS_TUNE.seaGate / 2);
    } else {
      // the side walls' inner faces are the yard's edges
      expect(Math.abs(wall.z - FORTRESS_TUNE.yardZ)).toBeLessThanOrEqual(FORTRESS_TUNE.yardD / 2);
      expect(Math.abs(wall.x) - across).toBeCloseTo(FORTRESS_TUNE.yardW / 2, 6);
    }
  }
});

test('the mech at x 0 walks through the sea gate and the land gate', () => {
  const game: GameModel = newPlayGame({ ...M1B_HAND, mines: [] }, MISSION);
  game.mech.x = 0;
  game.mech.y = 0;
  game.mech.z = -55;
  game.mech.yaw = 0;
  // the sea gate spans z -74..-68 and the land gate z -128..-122; past them is the open field
  let seaGate = false;
  let landGate = false;
  let highest = 0;
  for (let i = 0; i < 1200 && game.mech.z > -135; i++) {
    step(game, { ...idle, moveZ: 1 }, DT);
    if (game.mech.z < -74) seaGate = true;
    if (game.mech.z < -128) landGate = true;
    highest = Math.max(highest, game.mech.y);
    expect(Math.abs(game.mech.x)).toBeLessThan(1);
  }
  expect(game.mech.z).toBeLessThanOrEqual(-135);
  expect(seaGate).toBe(true);
  expect(landGate).toBe(true);
  // it walked on the ground, not up a wall
  expect(highest).toBe(0);
});
