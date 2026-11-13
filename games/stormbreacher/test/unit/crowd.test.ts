import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { FX_TUNE, type FxTune } from '../../src/data/tune.ts';
import { DEAD_LINGER, crowdCounts, newCrowd, spawnWave, stepCrowd, type Crowd } from '../../src/logic/crowd.ts';

const BOUNDS = { minX: -100, maxX: 100, minZ: -60, maxZ: 170 };
const DT = 1 / 60;

function tuneWith(changes: Partial<FxTune>): FxTune {
  return { ...FX_TUNE, ...changes };
}

function run(seed: number, steps: number, tune: FxTune, count = 10): Crowd {
  const crowd = newCrowd();
  const rng = createRng(seed);
  spawnWave(crowd, rng, BOUNDS, count);
  for (let i = 0; i < steps; i++) stepCrowd(crowd, rng, DT, tune);
  return crowd;
}

test('the same seed walks the same crowd, with soldiers falling', () => {
  const tune = tuneWith({ allyDeathRate: 5, allyWaves: 0 });
  const a = run(7, 60, tune);
  const b = run(7, 60, tune);
  expect(a.fallen).toBeGreaterThan(0);
  expect(a.soldiers).toEqual(b.soldiers);
  expect(crowdCounts(a)).toEqual(crowdCounts(b));
});

test('a wave brings the number asked for and walks toward -z', () => {
  const crowd = newCrowd();
  const rng = createRng(1);
  expect(spawnWave(crowd, rng, BOUNDS, 10)).toBe(10);
  expect(crowd.soldiers).toHaveLength(10);
  const before = crowd.soldiers.map(s => s.z);
  for (let i = 0; i < 60; i++) stepCrowd(crowd, rng, DT, tuneWith({ allyDeathRate: 0, allyWaves: 0 }));
  crowd.soldiers.forEach((soldier, i) => expect(soldier.z).toBeLessThan(before[i]));
});

test('with no deaths everyone reaches the line', () => {
  const crowd = run(3, 60 * 40, tuneWith({ allyDeathRate: 0, allyWaves: 0, allySpeed: 10 }), 10);
  expect(crowd.fallen).toBe(0);
  expect(crowd.through).toBe(10);
  expect(crowd.soldiers).toHaveLength(0);
});

test('a fallen soldier stays a few seconds and then goes', () => {
  const crowd = newCrowd();
  const rng = createRng(5);
  spawnWave(crowd, rng, BOUNDS, 10);
  stepCrowd(crowd, rng, DT, tuneWith({ allyDeathRate: 100, allyWaves: 0 }));
  expect(crowd.fallen).toBeGreaterThan(0);
  expect(crowd.soldiers.some(s => !s.alive)).toBe(true);

  // half the waiting time: the fallen are still on the ground
  for (let i = 0; i < Math.floor(DEAD_LINGER / 2 / DT); i++) {
    stepCrowd(crowd, rng, DT, tuneWith({ allyDeathRate: 0, allyWaves: 0 }));
  }
  expect(crowd.soldiers.some(s => !s.alive)).toBe(true);

  for (let i = 0; i < Math.ceil(DEAD_LINGER / DT) + 2; i++) {
    stepCrowd(crowd, rng, DT, tuneWith({ allyDeathRate: 0, allyWaves: 0 }));
  }
  expect(crowd.soldiers.some(s => !s.alive)).toBe(false);
});

test('no allies asked for means no one comes in', () => {
  const crowd = newCrowd();
  const rng = createRng(2);
  spawnWave(crowd, rng, BOUNDS, tuneWith({ allies: 0 }).allies);
  expect(crowd.soldiers).toHaveLength(0);
  expect(crowdCounts(crowd)).toEqual({ advancing: 0, fallen: 0, through: 0, capped: false });
});

test('spawnWave sets the far line and leaves the waiting line as it was', () => {
  const crowd = newCrowd();
  crowd.holdZ = 4;
  spawnWave(crowd, createRng(4), BOUNDS, 5);
  expect(crowd.holdZ).toBe(4);
  expect(crowd.lineZ).not.toBe(4);
});

test('a held crowd waits at holdZ, brings no new wave, and walks on to the line once let go', () => {
  const crowd = newCrowd();
  const rng = createRng(9);
  spawnWave(crowd, rng, BOUNDS, 10);
  crowd.holdZ = 0;
  // 30 s is enough to walk the 170 m from the sea edge at 10 m/s; the waves are due every 5 s
  const waiting = tuneWith({ allyDeathRate: 0, allyWaves: 5, allySpeed: 10 });
  for (let i = 0; i < 60 * 30; i++) stepCrowd(crowd, rng, DT, waiting, true);
  expect(crowd.through).toBe(0);
  expect(crowd.soldiers).toHaveLength(10);
  for (const soldier of crowd.soldiers) expect(soldier.z).toBeGreaterThanOrEqual(0);

  const walking = tuneWith({ allyDeathRate: 0, allyWaves: 0, allySpeed: 10 });
  for (let i = 0; i < 60 * 30; i++) stepCrowd(crowd, rng, DT, walking, false);
  expect(crowd.through).toBe(10);
  expect(crowd.soldiers).toHaveLength(0);
});
