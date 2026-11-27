import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { QUARTER_TUNE } from '../../src/data/tune.ts';
import type { TargetPlace } from '../../src/data/types.ts';
import { step, type GameInput } from '../../src/logic/game.ts';
import { seed } from '../../src/logic/rng.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
const AZ = QUARTER_TUNE.azimuth;
const MECH_Z = 166;

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

// A depot `dist` m from the mech at (0, MECH_Z), `angle` degrees to the right of the mech's forward (-z).
function atAngle(id: string, angle: number, dist: number): TargetPlace {
  const rad = (angle * Math.PI) / 180;
  return { id, kind: 'depot', x: Math.sin(rad) * dist, z: MECH_Z - Math.cos(rad) * dist, yaw: 0 };
}

test('a stick up moves the mech toward the screen’s top, not its own forward', () => {
  seed(7);
  const game = newPlayGame({ ...M1B_HAND, props: [], targets: [], mines: [], spawns: {} });
  const startX = game.mech.x;
  const startZ = game.mech.z;
  for (let i = 0; i < 30; i++) step(game, { ...idle, frame: AZ, moveZ: 1 }, DT);
  const dx = game.mech.x - startX;
  const dz = game.mech.z - startZ;
  const length = Math.hypot(dx, dz);
  expect(length).toBeGreaterThan(1);
  expect((dx * -Math.sin(AZ) + dz * -Math.cos(AZ)) / length).toBeCloseTo(1, 6);
});

test('a touch aim point turns the mech and the quarter FCS measures it', () => {
  seed(7);
  const game = newPlayGame({ ...M1B_HAND, props: [], targets: [atAngle('far', 90, 100)], mines: [], spawns: {} });
  const aimAt = { x: game.mech.x + 100, z: game.mech.z };
  for (let i = 0; i < 30; i++) step(game, { ...idle, aimAt }, DT);
  expect(game.mech.yaw).toBeCloseTo(-Math.PI / 2, 2);
  // FCS_QUARTER.range is 45 m, so the target 100 m out is not a candidate; FCS_TUNE.soft (200 m) would take it
  expect(game.aimTarget).toBeNull();
});

test('a frame alone uses the quarter FCS’s wider cone', () => {
  seed(7);
  const side = atAngle('side', 15, 30);
  const quarter = newPlayGame({ ...M1B_HAND, props: [], targets: [side], mines: [], spawns: {} });
  step(quarter, { ...idle, frame: AZ }, DT);
  expect(quarter.aimTarget).toBe('side');

  const soft = newPlayGame({ ...M1B_HAND, props: [], targets: [side], mines: [], spawns: {} });
  step(soft, idle, DT);
  expect(soft.aimTarget).toBeNull();
});

test('a frame alone uses the quarter FCS’s shorter reach', () => {
  seed(7);
  const far = atAngle('far', 0, 100);
  const quarter = newPlayGame({ ...M1B_HAND, props: [], targets: [far], mines: [], spawns: {} });
  step(quarter, { ...idle, frame: AZ }, DT);
  expect(quarter.aimTarget).toBeNull();

  const soft = newPlayGame({ ...M1B_HAND, props: [], targets: [far], mines: [], spawns: {} });
  step(soft, idle, DT);
  expect(soft.aimTarget).toBe('far');
});
