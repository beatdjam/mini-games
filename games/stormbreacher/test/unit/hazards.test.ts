// The hazards' pure functions: a barrage counts down while the mech is in reach and warns of a shell, a shell lands
// after its warning, a circle holds the mech or not, and a mine goes off under the mech's feet.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { BARRAGES, MINE_TUNE } from '../../src/data/hazards.ts';
import { inCircle, mineStepped, newBarrage, stepBarrage, stepShells } from '../../src/logic/hazards.ts';

const DT = 1 / 60;
const MORTAR = BARRAGES.mortar;
const BEACH = { x: 0, z: MORTAR.minZ + 100 };
const INLAND = { x: 0, z: MORTAR.minZ - 1 };

// Steps the barrage for `seconds` and returns the shells it warned of, each with the time it came.
function run(barrage: ReturnType<typeof newBarrage>, mech: { x: number; z: number }, seconds: number, seed = 1) {
  const rng = createRng(seed);
  const warned: { at: number; x: number; z: number; radius: number; left: number }[] = [];
  const frames = Math.round(seconds / DT);
  for (let i = 1; i <= frames; i++) {
    const shell = stepBarrage(barrage, mech, DT, rng);
    if (shell) warned.push({ at: i * DT, x: shell.x, z: shell.z, radius: shell.radius, left: shell.left });
  }
  return warned;
}

test('a barrage in reach warns of one shell each interval', () => {
  const warned = run(newBarrage('beach-mortar', 'mortar'), BEACH, MORTAR.interval * 3 + 0.1);
  expect(warned).toHaveLength(3);
  warned.forEach((shell, i) => expect(shell.at).toBeCloseTo(MORTAR.interval * (i + 1), 1));
  for (const shell of warned) {
    expect(shell.radius).toBe(MORTAR.radius);
    expect(shell.left).toBe(MORTAR.warn);
    // aimed within the jitter of the mech
    expect(Math.hypot(shell.x - BEACH.x, shell.z - BEACH.z)).toBeLessThanOrEqual(MORTAR.aimJitter + 1e-9);
  }
});

test('a barrage warns of nothing while the mech is out of reach, and does not count down', () => {
  const barrage = newBarrage('beach-mortar', 'mortar');
  expect(run(barrage, INLAND, MORTAR.interval * 5)).toHaveLength(0);
  expect(barrage.wait).toBe(MORTAR.interval);
  // back in reach, the first warning is one interval away
  const warned = run(barrage, BEACH, MORTAR.interval + 0.1);
  expect(warned).toHaveLength(1);
  expect(warned[0].at).toBeCloseTo(MORTAR.interval, 1);
});

test('the same random draws aim the same shells', () => {
  const a = run(newBarrage('w', 'mortar'), BEACH, 20, 9);
  const b = run(newBarrage('w', 'mortar'), BEACH, 20, 9);
  expect(a.length).toBeGreaterThan(3);
  expect(a).toEqual(b);
});

test('a shell lands when its warning has run out, and not before', () => {
  const shells = [{ x: 3, z: 4, radius: 7, warn: MORTAR.warn, left: MORTAR.warn, damage: MORTAR.damage }];
  let landed = stepShells(shells, MORTAR.warn - 0.1);
  expect(landed).toHaveLength(0);
  expect(shells).toHaveLength(1);
  landed = stepShells(shells, 0.2);
  expect(landed).toHaveLength(1);
  expect(landed[0]).toMatchObject({ x: 3, z: 4 });
  expect(shells).toHaveLength(0);
});

test('a circle holds the mech inside its radius and lets go outside it', () => {
  const circle = { x: 10, z: 10 };
  expect(inCircle(circle, MORTAR.radius, { x: 10, z: 10 })).toBe(true);
  expect(inCircle(circle, MORTAR.radius, { x: 10 + MORTAR.radius - 0.1, z: 10 })).toBe(true);
  expect(inCircle(circle, MORTAR.radius, { x: 10 + MORTAR.radius + 0.1, z: 10 })).toBe(false);
});

test('a mine goes off under the mech’s feet and not from afar', () => {
  const mine = { x: 0, z: 0 };
  expect(mineStepped(mine, { x: MINE_TUNE.stepRadius - 0.1, z: 0 })).toBe(true);
  expect(mineStepped(mine, { x: MINE_TUNE.stepRadius + 0.1, z: 0 })).toBe(false);
  // the blast reaches farther than the step
  expect(MINE_TUNE.blastRadius).toBeGreaterThan(MINE_TUNE.stepRadius);
});

const BATTERY = BARRAGES.battery;
const ON_WALL = { x: 0, z: -70 }; // the seawall's top
const BEHIND_WALL = { x: 0, z: -100 };
const SEAWARD = { x: 0, z: -64 };

test('the battery’s barrage reaches the seawall’s top and the ground behind it, and not the land seaward of the wall', () => {
  expect(BATTERY.maxZ).toBe(-65);
  expect(run(newBarrage('battery', 'battery'), ON_WALL, BATTERY.interval + 0.1)).toHaveLength(1);
  expect(run(newBarrage('battery', 'battery'), BEHIND_WALL, BATTERY.interval + 0.1)).toHaveLength(1);
  expect(run(newBarrage('battery', 'battery'), SEAWARD, BATTERY.interval * 4)).toHaveLength(0);
  // the mortar still reaches only the beach, not the wall
  expect(run(newBarrage('beach-mortar', 'mortar'), ON_WALL, MORTAR.interval * 4)).toHaveLength(0);
});

test('a slowed barrage counts its interval as many times as long', () => {
  const slow = BATTERY.slow;
  if (!slow) throw new Error('the battery’s barrage has no slow');
  expect(slow).toEqual({ flag: 'depot-down', mul: 1.5 });
  const rng = createRng(1);
  const barrage = newBarrage('battery', 'battery');
  const at: number[] = [];
  for (let i = 1; i <= Math.round((BATTERY.interval * slow.mul * 3 + 0.1) / DT); i++) {
    if (stepBarrage(barrage, ON_WALL, DT, rng, slow.mul)) at.push(i * DT);
  }
  expect(at).toHaveLength(3);
  at.forEach((time, i) => expect(time).toBeCloseTo(BATTERY.interval * slow.mul * (i + 1), 1));
});
