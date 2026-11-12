// The pillboxes' pure functions: a pillbox warns of a burst and fires it only while its line to the mech is clear, and
// its shots leave outside its own box.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { PILLBOX_ARMOR, PILLBOX_TUNE } from '../../src/data/pillbox.ts';
import { rectBox } from '../../src/logic/collide.ts';
import type { Aabb } from '../../src/logic/fire.ts';
import { newPillbox, pillboxDamageMul, pillboxFront, pillboxMuzzle, stepPillbox } from '../../src/logic/pillbox.ts';

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
  expect(warns[1] - shots[shots.length - 1]).toBeCloseTo(PILLBOX_TUNE.interval, 2);
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

// A shot that comes from `deg` around `front`: the bullet flies the opposite way, so the front is turned round to the
// shooter and then back again. The fronts are written out rather than taken from pillboxFront, so the test does not
// check one function against itself.
const FRONT = { x: 0, z: 1 };
const TURNED_FRONT = { x: Math.sin(0.2), z: Math.cos(0.2) };

function shotFrom(deg: number, front: { x: number; z: number }): { dx: number; dz: number } {
  const turn = (deg * Math.PI) / 180;
  const x = front.x * Math.cos(turn) + front.z * Math.sin(turn);
  const z = -front.x * Math.sin(turn) + front.z * Math.cos(turn);
  return { dx: -x, dz: -z };
}

test('a pillbox takes a quarter of a shot from its front and all of one from its side or back', () => {
  const front = shotFrom(0, FRONT);
  expect(pillboxDamageMul(0, front.dx, front.dz)).toBe(PILLBOX_ARMOR.frontMul);
  // just inside and just outside the front arc
  const inside = shotFrom(44, FRONT);
  expect(pillboxDamageMul(0, inside.dx, inside.dz)).toBe(PILLBOX_ARMOR.frontMul);
  const outside = shotFrom(46, FRONT);
  expect(pillboxDamageMul(0, outside.dx, outside.dz)).toBe(PILLBOX_ARMOR.sideMul);
  const side = shotFrom(90, FRONT);
  expect(pillboxDamageMul(0, side.dx, side.dz)).toBe(PILLBOX_ARMOR.sideMul);
  const back = shotFrom(180, FRONT);
  expect(pillboxDamageMul(0, back.dx, back.dz)).toBe(PILLBOX_ARMOR.sideMul);
  // a shot with no horizontal direction cannot come from the front
  expect(pillboxDamageMul(0, 0, 0)).toBe(PILLBOX_ARMOR.sideMul);
});

test('a turned pillbox keeps the same front and side from its own yaw', () => {
  const front = shotFrom(0, TURNED_FRONT);
  expect(pillboxDamageMul(0.2, front.dx, front.dz)).toBe(PILLBOX_ARMOR.frontMul);
  const side = shotFrom(90, TURNED_FRONT);
  expect(pillboxDamageMul(0.2, side.dx, side.dz)).toBe(PILLBOX_ARMOR.sideMul);
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
