// The moving dummies of #view-fcs (SB-060): eight boxes that stand, strafe, circle or charge, take a number of hits
// and come back after a while. Pure functions over a list, no three and no DOM, so a node test can run them.
import type { Rng } from '@engine/core/index.ts';
import { DUMMY_TUNE, type DummyTune } from '../data/tune.ts';
import type { Aabb } from './fire.ts';

export type DummyMove = 'still' | 'strafe' | 'circle' | 'charge';

export interface Dummy {
  id: number;
  move: DummyMove;
  x: number; // the box's feet (m)
  y: number; // the box's feet (m); the ground is 0
  z: number;
  hp: number; // hits left before it goes down
  deadT: number; // seconds left down; 0 while it stands (s)
  phase: number; // how far its move has run (s)
  homeX: number; // where it comes back after a down (m)
  homeZ: number;
}

export const DUMMY_WIDTH = 2; // the box's width across (m)
export const DUMMY_DEPTH = 2; // the box's depth (m)
export const DUMMY_HEIGHT = 4; // the box's height (m)

const SPAWN_FRONT = 45; // how far in front the dummies start (m)
const SPAWN_SPREAD = 40; // how much farther back one may start (m)
const LANE = 6; // the gap between the starting places across (m)
const STRAFE_RANGE = 8; // how far a strafe goes from its home (m)
const CIRCLE_RADIUS = 10; // the circle's radius (m)
const CHARGE_RANGE = 15; // how far a charge comes toward the mech (m)
const PHASE_SCALE = 8; // the speed at which the curves move (m/s)

const MOVES: readonly DummyMove[] = ['still', 'still', 'strafe', 'strafe', 'circle', 'circle', 'charge', 'charge'];

// Builds the eight dummies: two of each kind, in front of a mech that faces -z at the start.
export function spawnDummies(rng: Rng): Dummy[] {
  return MOVES.map((move, index) => {
    const x = (index - (MOVES.length - 1) / 2) * LANE + rng.rand(-2, 2);
    const z = -(SPAWN_FRONT + rng.rand(0, SPAWN_SPREAD));
    return {
      id: index,
      move,
      x,
      y: 0,
      z,
      hp: DUMMY_TUNE.hp,
      deadT: 0,
      phase: rng.rand(0, Math.PI * 2),
      homeX: x,
      homeZ: z,
    };
  });
}

// Moves one dummy along its kind's curve; a dead one waits and then comes back home.
function stepDummy(dummy: Dummy, dt: number, tune: DummyTune) {
  if (dummy.deadT > 0) {
    dummy.deadT = Math.max(0, dummy.deadT - dt);
    if (dummy.deadT === 0) {
      dummy.x = dummy.homeX;
      dummy.z = dummy.homeZ;
      dummy.hp = tune.hp;
      dummy.phase = 0;
    }
    return;
  }
  dummy.phase += dt;
  const t = dummy.phase;
  switch (dummy.move) {
    case 'still':
      dummy.x = dummy.homeX;
      dummy.z = dummy.homeZ;
      break;
    case 'strafe':
      dummy.x = dummy.homeX + Math.sin(t * (tune.speed / PHASE_SCALE)) * STRAFE_RANGE;
      dummy.z = dummy.homeZ;
      break;
    case 'circle':
      dummy.x = dummy.homeX + Math.cos(t * (tune.speed / CIRCLE_RADIUS)) * CIRCLE_RADIUS;
      dummy.z = dummy.homeZ + Math.sin(t * (tune.speed / CIRCLE_RADIUS)) * CIRCLE_RADIUS;
      break;
    case 'charge':
      dummy.x = dummy.homeX;
      dummy.z = dummy.homeZ + Math.sin(t * (tune.speed / CHARGE_RANGE)) * CHARGE_RANGE;
      break;
  }
}

export function stepDummies(list: readonly Dummy[], dt: number, tune: DummyTune) {
  if (!(dt > 0)) return;
  for (const dummy of list) stepDummy(dummy, dt, tune);
}

// Takes one hit. True when that hit brought the dummy down.
export function hitDummy(dummy: Dummy, tune: DummyTune): boolean {
  if (dummy.deadT > 0) return false;
  dummy.hp -= 1;
  if (dummy.hp > 0) return false;
  dummy.deadT = tune.respawn;
  return true;
}

export function dummyBox(dummy: Dummy): Aabb {
  const halfW = DUMMY_WIDTH / 2;
  const halfD = DUMMY_DEPTH / 2;
  return {
    minX: dummy.x - halfW,
    maxX: dummy.x + halfW,
    minY: dummy.y,
    maxY: dummy.y + DUMMY_HEIGHT,
    minZ: dummy.z - halfD,
    maxZ: dummy.z + halfD,
  };
}
