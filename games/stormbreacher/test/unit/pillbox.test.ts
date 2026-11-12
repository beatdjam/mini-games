// The pillboxes' pure functions: a pillbox warns of a burst and fires it only while its line to the mech is clear, and
// its shots leave outside its own box.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { PILLBOX_TUNE } from '../../src/data/pillbox.ts';
import { rectBox } from '../../src/logic/collide.ts';
import type { Aabb } from '../../src/logic/fire.ts';
import { newPillbox, pillboxFront, pillboxMuzzle, stepPillbox } from '../../src/logic/pillbox.ts';

const DT = 1 / 60;
// a pillbox like the hand map's: 12 wide, 8 deep and 6 high, at the origin, its front toward +z
const BOX: Aabb = { minX: -6, maxX: 6, minY: 0, maxY: 6, minZ: -4, maxZ: 4 };
const NEAR = { x: 0, y: 0, z: 40 };
const FAR = { x: 0, y: 0, z: PILLBOX_TUNE.range + 10 };
const WALL: Aabb = { minX: -20, maxX: 20, minY: 0, maxY: 30, minZ: 20, maxZ: 22 };

// Steps a new pillbox for `seconds` and returns the times (s) its warnings started and its shots left.
function run(
  mech: { x: number; y: number; z: number },
  blockers: Aabb[],
  seconds: number,
  seed = 1,
): { warns: number[]; shots: number[] } {
  const state = newPillbox('p');
  const rng = createRng(seed);
  const warns: number[] = [];
  const shots: number[] = [];
  for (let i = 1; i <= Math.round(seconds / DT); i++) {
    const out = stepPillbox(state, BOX, 0, mech, blockers, DT, rng);
    if (out.warnAt) warns.push(i * DT);
    if (out.shot) shots.push(i * DT);
  }
  return { warns, shots };
}

test('a pillbox does not warn or fire out of range, through a wall or from behind its own box', () => {
  const out = run(FAR, [], 5);
  expect(out.warns).toHaveLength(0);
  expect(out.shots).toHaveLength(0);

  const walled = run(NEAR, [WALL], 5);
  expect(walled.warns).toHaveLength(0);
  expect(walled.shots).toHaveLength(0);

  // the mech behind the pillbox: the pillbox's own box stops the line
  const behind = run({ x: 0, y: 0, z: -40 }, [], 5);
  expect(behind.warns).toHaveLength(0);
  expect(behind.shots).toHaveLength(0);

  // and to its side
  const aside = run({ x: 40, y: 0, z: 0 }, [], 5);
  expect(aside.warns).toHaveLength(0);
  expect(aside.shots).toHaveLength(0);
});

test('a pillbox warns, fires its burst at the interval, then waits before the next warning', () => {
  // long enough for the second warning, not for its burst
  const seconds = PILLBOX_TUNE.firstWait + PILLBOX_TUNE.warn + PILLBOX_TUNE.burst * PILLBOX_TUNE.shotInterval;
  const { warns, shots } = run(NEAR, [], seconds + PILLBOX_TUNE.interval + 0.3);
  expect(warns).toHaveLength(2);
  expect(warns[0]).toBeCloseTo(PILLBOX_TUNE.firstWait, 1);
  expect(shots).toHaveLength(PILLBOX_TUNE.burst);
  expect(shots[0] - warns[0]).toBeCloseTo(PILLBOX_TUNE.warn, 1);
  for (let i = 1; i < shots.length; i++) {
    expect(shots[i] - shots[i - 1]).toBeCloseTo(PILLBOX_TUNE.shotInterval, 1);
  }
  // no shot in the interval after the burst, and the next warning comes after it
  expect(warns[1] - shots[shots.length - 1]).toBeCloseTo(PILLBOX_TUNE.interval, 0);
});

test('a shot leaves outside the pillbox, at the muzzle’s share of its height', () => {
  const muzzle = pillboxMuzzle(BOX, 0);
  expect(muzzle.z).toBeGreaterThan(BOX.maxZ);
  expect(muzzle.y).toBeCloseTo(BOX.maxY * PILLBOX_TUNE.muzzle);

  // a turned pillbox leaves the box its yaw makes
  const turned = rectBox({ x: 0, z: 0, halfW: 6, halfD: 4, yaw: 0.2, top: 6 });
  const turnedMuzzle = pillboxMuzzle(turned, 0.2);
  const outside =
    turnedMuzzle.x < turned.minX ||
    turnedMuzzle.x > turned.maxX ||
    turnedMuzzle.z < turned.minZ ||
    turnedMuzzle.z > turned.maxZ;
  expect(outside).toBe(true);
  expect(turnedMuzzle.y).toBeCloseTo(turned.maxY * PILLBOX_TUNE.muzzle);
  expect(pillboxFront(0.2)).toEqual({ x: Math.sin(0.2), z: Math.cos(0.2) });
});

test('the same seed gives the same burst', () => {
  const directions = (seed: number): number[] => {
    const state = newPillbox('p');
    const rng = createRng(seed);
    const out: number[] = [];
    for (let i = 0; i < 400; i++) {
      const shot = stepPillbox(state, BOX, 0, NEAR, [], DT, rng).shot;
      if (shot) out.push(shot.dx, shot.dy, shot.dz);
    }
    return out;
  };
  expect(directions(5).length).toBeGreaterThan(0);
  expect(directions(5)).toEqual(directions(5));
});
