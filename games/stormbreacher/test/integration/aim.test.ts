import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { CAMERA_TUNE, FCS_TUNE } from '../../src/data/tune.ts';
import type { Prop } from '../../src/data/types.ts';
import { step, type GameEvent, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { seed } from '../../src/logic/rng.ts';
import { aimRay } from '../../src/view/camera.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
const DEG = Math.PI / 180;
const MARGIN = 0.15; // what the spread's reach does not account for: the box's and the ray's rounding (m)
const MECH_Z = 100; // the mech's place on z; it faces -z (m)
const WALL_PITCH = 0.2; // the camera looks a little up, so its centre line reaches a wall 20 to 120 m ahead above the ground (rad)

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

type HitEvent = Extract<GameEvent, { kind: 'hit' }>;

// A cliff (20 x 30 x 16 m) whose front face is `dist` m ahead of the mech, with no other prop and no target.
function gameWithWall(dist: number): GameModel {
  const cliff: Prop = { kind: 'cliff', x: 0, z: MECH_Z - dist - 8, yaw: 0, scale: 1 };
  const game = newPlayGame({ ...M1B_HAND, props: [cliff], targets: [], mines: [] });
  game.mech.x = 0;
  game.mech.z = MECH_Z;
  game.mech.yaw = 0;
  return game;
}

// The camera's centre line, as the view makes it, for the mech standing as it is.
function cameraAim(game: GameModel, pitch: number) {
  const { x, y, z, yaw } = game.mech;
  return aimRay({ x, y, z, yaw }, pitch, CAMERA_TUNE);
}

// One shot fired along `aim`; where its bullet reported the hit.
function shootAt(game: GameModel, aim: ReturnType<typeof cameraAim>): HitEvent {
  step(game, { ...idle, fire: true, aim }, DT);
  for (let i = 0; i < 240; i++) {
    for (const event of game.events) if (event.kind === 'hit') return event;
    step(game, { ...idle, aim }, DT);
  }
  throw new Error('the shot hit nothing');
}

// How far a point at `dist` m can be from the reticle's point through the spread alone (m).
function spreadReach(dist: number): number {
  return Math.tan(FCS_TUNE.soft.spread * DEG) * dist + MARGIN;
}

for (const dist of [20, 50, 120]) {
  test(`a shot lands on the point of a wall the reticle is on, ${dist} m ahead`, () => {
    seed(7);
    const game = gameWithWall(dist);
    const aim = cameraAim(game, WALL_PITCH);
    // where the camera's centre line meets the wall's front face (the plane z = MECH_Z - dist)
    const t = (MECH_Z - dist - aim.oz) / aim.dz;
    const want = { x: aim.ox + aim.dx * t, y: aim.oy + aim.dy * t, z: MECH_Z - dist };
    const hit = shootAt(game, aim);
    expect(hit.prop).not.toBeNull();
    const gap = Math.hypot(hit.x - want.x, hit.y - want.y, hit.z - want.z);
    expect(gap).toBeLessThan(spreadReach(dist));
  });
}

test('a shot goes forward when a prop sits between the camera and the muzzle', () => {
  seed(7);
  // The block stands behind the mech, between it and the camera: the aim line meets it before it passes the muzzle.
  const block: Prop = { kind: 'block', x: 1, z: MECH_Z + 4, yaw: 0, scale: 1 };
  const game = newPlayGame({ ...M1B_HAND, props: [block], targets: [], mines: [] });
  game.mech.x = 0;
  game.mech.z = MECH_Z;
  game.mech.yaw = 0;
  const aim = cameraAim(game, WALL_PITCH);
  step(game, { ...idle, fire: true, aim }, DT);
  const shot = game.events.find((event): event is Extract<GameEvent, { kind: 'shot' }> => event.kind === 'shot');
  expect(shot).toBeDefined();
  const forward = shot!.dx * aim.dx + shot!.dy * aim.dy + shot!.dz * aim.dz;
  expect(forward).toBeGreaterThan(0);
});

test('a shot aimed at the ground lands near the ground point the reticle is on', () => {
  seed(7);
  const game = gameWithWall(150);
  const aim = cameraAim(game, -0.3);
  const t = -aim.oy / aim.dy;
  const want = { x: aim.ox + aim.dx * t, z: aim.oz + aim.dz * t };
  const dist = Math.hypot(want.x - game.mech.x, want.z - game.mech.z);
  const hit = shootAt(game, aim);
  expect(hit.prop).toBeNull();
  expect(hit.y).toBeCloseTo(0, 6);
  expect(Math.hypot(hit.x - want.x, hit.z - want.z)).toBeLessThan(spreadReach(dist) * 2);
});
