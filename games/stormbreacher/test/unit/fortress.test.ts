// The fortress nest's pure functions (SB-1830): it waits `rest`, sweeps `shots` at `interval` across its arc, and stops
// the burst when the line is broken. A shot leaves the middle of the box, above its top and seaward of its seaward face.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { FORTRESS_GUN_TUNE } from '../../src/data/fortress.ts';
import type { Rng } from '@engine/core/index.ts';
import { newFortressGun, stepFortressGun, type FortressGunState } from '../../src/logic/fortress.ts';
import type { EnemyShot } from '../../src/logic/enemies.ts';
import type { Aabb } from '../../src/logic/fire.ts';

const DT = 1 / 60;
// the map's nest: 16 wide and 6 deep, 10 high, set on the wall's top (bottom 12) at (20, -71)
const GUN_BOX: Aabb = { minX: 12, maxX: 28, minY: 12, maxY: 22, minZ: -74, maxZ: -68 };
const MECH = { x: 0, y: 0, z: -50 };
const DEG = 180 / Math.PI;

function shotsOf(
  mech: { x: number; y: number; z: number },
  blockers: Aabb[],
  seconds: number,
  seed = 1,
  state: FortressGunState = newFortressGun(),
): { at: number; shot: EnemyShot }[] {
  const rng: Rng = createRng(seed);
  const shots: { at: number; shot: EnemyShot }[] = [];
  for (let i = 1; i <= Math.round(seconds / DT); i++) {
    const shot = stepFortressGun(state, GUN_BOX, mech, blockers, DT, rng);
    if (shot) shots.push({ at: i * DT, shot });
  }
  return shots;
}

// The horizontal angle of a shot from the direct line to the mech (deg): negative is left of it.
function angleOff(shot: EnemyShot, mech: { x: number; y: number; z: number }): number {
  const want = Math.atan2(mech.x - shot.x, mech.z - shot.z);
  const got = Math.atan2(shot.dx, shot.dz);
  return Math.atan2(Math.sin(got - want), Math.cos(got - want)) * DEG;
}

test('the nest waits rest, then sweeps its shots at interval and rests again', () => {
  const seconds = FORTRESS_GUN_TUNE.rest + FORTRESS_GUN_TUNE.interval * (FORTRESS_GUN_TUNE.shots - 1) + 0.2;
  const shots = shotsOf(MECH, [], seconds);
  expect(shots).toHaveLength(FORTRESS_GUN_TUNE.shots);
  expect(shots[0].at).toBeCloseTo(FORTRESS_GUN_TUNE.rest, 1);
  for (let i = 1; i < shots.length; i++) {
    expect(shots[i].at - shots[i - 1].at).toBeCloseTo(FORTRESS_GUN_TUNE.interval, 1);
  }
  // after the last shot the next one comes a whole rest later
  const next = shotsOf(MECH, [], seconds + FORTRESS_GUN_TUNE.rest);
  expect(next).toHaveLength(FORTRESS_GUN_TUNE.shots + 1);
  expect(next[next.length - 1].at - shots[shots.length - 1].at).toBeCloseTo(FORTRESS_GUN_TUNE.rest, 1);
});

test('the burst sweeps the arc from its left end to its right end', () => {
  const shots = shotsOf(MECH, [], FORTRESS_GUN_TUNE.rest + FORTRESS_GUN_TUNE.interval * FORTRESS_GUN_TUNE.shots);
  expect(shots).toHaveLength(FORTRESS_GUN_TUNE.shots);
  const half = FORTRESS_GUN_TUNE.arcDeg / 2;
  const angles = shots.map(({ shot }) => angleOff(shot, MECH));
  // the ends are the arc's ends, within the spread laid over each shot
  expect(Math.abs(angles[0] + half)).toBeLessThanOrEqual(FORTRESS_GUN_TUNE.spread + 1);
  expect(Math.abs(angles[angles.length - 1] - half)).toBeLessThanOrEqual(FORTRESS_GUN_TUNE.spread + 1);
  for (const angle of angles) expect(Math.abs(angle)).toBeLessThanOrEqual(half + FORTRESS_GUN_TUNE.spread + 1);
  for (let i = 1; i < angles.length; i++) expect(angles[i]).toBeGreaterThan(angles[i - 1]);
});

test('a shot leaves the box’s middle, above its top and past its seaward face', () => {
  const [first] = shotsOf(MECH, [], FORTRESS_GUN_TUNE.rest + 0.1);
  const shot = first.shot;
  expect(shot.x).toBeCloseTo((GUN_BOX.minX + GUN_BOX.maxX) / 2, 6);
  expect(shot.z).toBeGreaterThan(GUN_BOX.maxZ);
  expect(shot.z).toBeCloseTo(GUN_BOX.maxZ + FORTRESS_GUN_TUNE.muzzleGap, 6);
  expect(shot.y).toBeGreaterThan(GUN_BOX.maxY * 0.5);
  expect(shot.y).toBeCloseTo(GUN_BOX.maxY * FORTRESS_GUN_TUNE.muzzle, 6);
  expect(Math.hypot(shot.dx, shot.dy, shot.dz)).toBeCloseTo(1, 6);
});

test('a line broken in the middle of a burst stops it and starts the rest again', () => {
  const state = newFortressGun();
  const rng = createRng(3);
  let shots = 0;
  for (let i = 0; i < Math.round((FORTRESS_GUN_TUNE.rest + FORTRESS_GUN_TUNE.interval * 1.5) / DT); i++) {
    if (stepFortressGun(state, GUN_BOX, MECH, [], DT, rng)) shots++;
  }
  expect(shots).toBeGreaterThanOrEqual(2);
  const wall: Aabb = { minX: -30, maxX: 30, minY: 0, maxY: 30, minZ: -62, maxZ: -61 };
  for (let i = 0; i < Math.round(FORTRESS_GUN_TUNE.rest / DT); i++) {
    expect(stepFortressGun(state, GUN_BOX, MECH, [wall], DT, rng)).toBeNull();
  }
  expect(state.burstLeft).toBe(FORTRESS_GUN_TUNE.shots);
  // with the wall gone, the next burst starts after the rest it went into
  let next: EnemyShot | null = null;
  for (let i = 0; i < Math.round(FORTRESS_GUN_TUNE.rest / DT) && !next; i++) {
    next = stepFortressGun(state, GUN_BOX, MECH, [], DT, rng);
  }
  expect(next).not.toBeNull();
});

test('the nest holds fire on a mech past its range', () => {
  const far = { x: MECH.x, y: MECH.y, z: MECH.z + FORTRESS_GUN_TUNE.range + 20 };
  expect(shotsOf(far, [], FORTRESS_GUN_TUNE.rest + 1)).toHaveLength(0);
});

test('the same seed aims the same shots', () => {
  const run = (): number[] => {
    const shots = shotsOf(MECH, [], FORTRESS_GUN_TUNE.rest + FORTRESS_GUN_TUNE.interval * FORTRESS_GUN_TUNE.shots, 5);
    return shots.flatMap(({ shot }) => [shot.dx, shot.dy, shot.dz]);
  };
  expect(run()).toEqual(run());
});
