import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { FX_TUNE, type FxTune } from '../../src/data/tune.ts';
import {
  DEAD_LINGER,
  crowdCounts,
  fallNear,
  newCrowd,
  spawnWave,
  stepCrowd,
  type Crowd,
} from '../../src/logic/crowd.ts';

const BOUNDS = { minX: -100, maxX: 100, minZ: -60, maxZ: 170 };
const DT = 1 / 60;
// Two machine-gun nests, as M1's B line has them (m).
const NESTS = [
  { x: -30, z: 147 },
  { x: 45, z: 147 },
];

function tuneWith(changes: Partial<FxTune>): FxTune {
  return { ...FX_TUNE, ...changes };
}

function run(seed: number, steps: number, tune: FxTune, count = 10): Crowd {
  const crowd = newCrowd();
  const rng = createRng(seed);
  spawnWave(crowd, rng, BOUNDS, count, tune);
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
  expect(spawnWave(crowd, rng, BOUNDS, 10, FX_TUNE)).toBe(10);
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
  spawnWave(crowd, rng, BOUNDS, 10, FX_TUNE);
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
  spawnWave(crowd, rng, BOUNDS, tuneWith({ allies: 0 }).allies, FX_TUNE);
  expect(crowd.soldiers).toHaveLength(0);
  expect(crowdCounts(crowd)).toEqual({ advancing: 0, fallen: 0, through: 0, capped: false });
});

test('spawnWave sets the far line and leaves the waiting line as it was', () => {
  const crowd = newCrowd();
  crowd.holdZ = 4;
  spawnWave(crowd, createRng(4), BOUNDS, 5, FX_TUNE);
  expect(crowd.holdZ).toBe(4);
  expect(crowd.lineZ).not.toBe(4);
});

test('a held crowd waits at holdZ, brings no new wave, and walks on to the line once let go', () => {
  const crowd = newCrowd();
  const rng = createRng(9);
  spawnWave(crowd, rng, BOUNDS, 10, FX_TUNE);
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

test('a wave of 20 comes in as two squads of five on the nests, and the rest scattered', () => {
  const crowd = newCrowd();
  crowd.nests = NESTS;
  const tune = tuneWith({ allies: 20, squads: 2, squad: 5, squadFallShare: 0.4, squadFallRadius: 10 });
  expect(spawnWave(crowd, createRng(1), BOUNDS, 20, tune)).toBe(20);
  expect(crowd.soldiers).toHaveLength(20);
  const inSquads = crowd.soldiers.filter(soldier => soldier.squad > 0);
  expect(inSquads).toHaveLength(10);
  expect(new Set(inSquads.map(soldier => soldier.squad)).size).toBe(2);
  for (const id of [1, 2]) expect(inSquads.filter(soldier => soldier.squad === id)).toHaveLength(5);
  expect(crowd.soldiers.filter(soldier => soldier.squad === 0)).toHaveLength(10);
  // each squad comes in close to its own nest
  for (const [n, nest] of NESTS.entries()) {
    const squad = inSquads.filter(soldier => soldier.squad === n + 1);
    for (const soldier of squad) expect(Math.abs(soldier.x - nest.x)).toBeLessThanOrEqual(3 + 2.2);
  }
  // two of each squad are to fall at the nest, the rest walk on
  for (const id of [1, 2]) {
    expect(inSquads.filter(soldier => soldier.squad === id && soldier.fallAt !== null)).toHaveLength(2);
  }
});

test('the share of a squad falls at the nest, and the rest of the squad walks on', () => {
  const crowd = newCrowd();
  crowd.nests = [{ x: 0, z: 147 }];
  const tune = tuneWith({
    allies: 10,
    squads: 2,
    squad: 5,
    squadFallShare: 0.4,
    squadFallRadius: 10,
    allyDeathRate: 0,
    allyWaves: 0,
    allySpeed: 10,
  });
  const rng = createRng(3);
  spawnWave(crowd, rng, BOUNDS, 10, tune);
  // 3 s at 10 m/s walks the 15 m from the sea edge to the nest's z 147
  for (let i = 0; i < 60 * 3; i++) stepCrowd(crowd, rng, DT, tune);
  expect(crowd.fallen).toBe(4);
  expect(crowd.soldiers.filter(soldier => !soldier.alive)).toHaveLength(4);
  expect(crowd.soldiers.filter(soldier => soldier.alive && soldier.squad > 0)).toHaveLength(6);
});

test('a shell makes the soldiers inside its radius fall, by its share', () => {
  const crowd = newCrowd();
  const rng = createRng(4);
  const tune = tuneWith({ allyDeathRate: 0, allyWaves: 0 });
  spawnWave(crowd, rng, BOUNDS, 10, tune);
  // a line of soldiers 3 m apart at z 0, so a shell at the middle catches the first three
  crowd.soldiers.forEach((soldier, i) => {
    soldier.x = i * 3;
    soldier.z = 0;
  });
  const near = fallNear(crowd, 0, 0, 7, 1, rng);
  expect(near.map(soldier => soldier.x)).toEqual([0, 3, 6]);
  expect(near.every(soldier => !soldier.alive)).toBe(true);
  expect(crowd.fallen).toBe(3);
  // a share or a radius of 0 keeps the rest up
  expect(fallNear(crowd, 0, 0, 100, 0, rng)).toHaveLength(0);
  expect(fallNear(crowd, 0, 0, 0, 1, rng)).toHaveLength(0);
  expect(crowd.fallen).toBe(3);
});
