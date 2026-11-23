// A ramp is walked up and down smoothly: its surface climbs in a straight line under the mech (no step-like jumps), and
// the mech reaches the seawall's top on the way up and the ground on the way down. M1 itself no longer has a ramp, so the
// walk uses a map of its own with a seawall and one ramp in front of it.
import { expect, test } from 'vitest';
import type { MapDef, MissionDef, Prop } from '../../src/data/types.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import { MECH_TUNE, MOVE_TUNE } from '../../src/data/tune.ts';
import { step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;

// A seawall across the ground, three rows as M1 had, with one ramp in front of its middle (x 0, z -56).
const PROPS: Prop[] = [];
for (const z of [-73, -70, -67]) {
  for (let x = -56; x <= 56; x += 8) PROPS.push({ kind: 'seawall', x, z, yaw: 0, scale: 1 });
}
PROPS.push({ kind: 'ramp', x: 0, z: -56, yaw: 0, scale: 1 });

const MAP: MapDef = {
  id: 'ramp-test',
  bounds: { minX: -60, maxX: 60, minZ: -120, maxZ: 170 },
  props: PROPS,
  targets: [],
  spawns: {},
};

// The walk asks nothing of the script: the map is about the ramp alone.
const MISSION: MissionDef = {
  id: 'ramp-test',
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

function newRampGame(): GameModel {
  return newPlayGame(MAP, MISSION);
}

test('the mech walks up a ramp smoothly to the seawall’s top', () => {
  const game = newRampGame();
  game.mech.x = 0;
  game.mech.z = -45;
  game.mech.yaw = 0;
  let before = game.mech.y;
  let rise = 0;
  for (let i = 0; i < 400 && game.mech.z > -65; i++) {
    step(game, { ...idle, moveZ: 1 }, DT);
    rise = Math.max(rise, game.mech.y - before);
    before = game.mech.y;
  }
  expect(game.mech.z).toBeLessThanOrEqual(-64.5);
  expect(game.mech.y).toBeCloseTo(PROP_SIZE.seawall.h, 2);
  expect(rise).toBeLessThanOrEqual(MAX_STEP);
});

test('the mech walks down a ramp smoothly to the ground', () => {
  const game = newRampGame();
  game.mech.x = 0;
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
  expect(game.mech.z).toBeGreaterThanOrEqual(-44);
  expect(game.mech.y).toBeCloseTo(0, 2);
  expect(drop).toBeLessThanOrEqual(MAX_STEP);
});

test('the sides of a ramp hold the mech on its width partway up', () => {
  const game = newRampGame();
  game.mech.x = 0;
  game.mech.z = -56;
  game.mech.y = PROP_SIZE.ramp.h / 2;
  game.mech.yaw = 0;
  let widest = Math.abs(game.mech.x);
  for (let i = 0; i < 180; i++) {
    step(game, { ...idle, moveX: 1 }, DT);
    widest = Math.max(widest, Math.abs(game.mech.x));
  }
  const inside = PROP_SIZE.ramp.w / 2 - MECH_TUNE.radius;
  expect(widest).toBeLessThanOrEqual(inside + 0.01);
  expect(game.mech.y).toBeCloseTo(PROP_SIZE.ramp.h / 2, 1);
  expect(game.mech.grounded).toBe(true);
});
