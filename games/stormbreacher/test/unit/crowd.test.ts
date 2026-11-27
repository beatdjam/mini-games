import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { FX_TUNE, PLAY_BATTLE_TUNE, type FxTune } from '../../src/data/tune.ts';
import {
  DEAD_LINGER,
  catchUp,
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
  for (const soldier of crowd.soldiers) {
    expect(soldier.z).toBeGreaterThanOrEqual(0);
    // at the line it stands still and faces the land; it does not sway on the spot
    expect(soldier.yaw).toBe(0);
  }

  const walking = tuneWith({ allyDeathRate: 0, allyWaves: 0, allySpeed: 10 });
  for (let i = 0; i < 60 * 30; i++) stepCrowd(crowd, rng, DT, walking, false);
  expect(crowd.through).toBe(10);
  expect(crowd.soldiers).toHaveLength(0);
});

test('nobody falls to the steady loss while held, and the ones that waited survive the advance', () => {
  const crowd = newCrowd();
  const rng = createRng(12);
  const tune = tuneWith({ allyDeathRate: 5, allyWaves: 0, allySpeed: 10 });
  spawnWave(crowd, rng, BOUNDS, 10, tune);
  crowd.holdZ = 0;
  // 30 s: they reach the waiting line in 17 s and stand there with the steady loss still on
  for (let i = 0; i < 60 * 30; i++) stepCrowd(crowd, rng, DT, tune, true);
  expect(crowd.fallen).toBe(0);
  expect(crowd.soldiers.filter(soldier => soldier.alive)).toHaveLength(10);
  // let go: the ones that waited must reach the far line rather than falling on the way
  for (let i = 0; i < 60 * 30; i++) stepCrowd(crowd, rng, DT, tune, false);
  expect(crowd.fallen).toBe(0);
  expect(crowd.through).toBe(10);
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

test('the sortie’s waiting line loses no soldier while it waits with no shell or mine', () => {
  const crowd = newCrowd();
  const rng = createRng(31);
  spawnWave(crowd, rng, BOUNDS, 300, PLAY_BATTLE_TUNE);
  crowd.holdZ = 150;
  // two minutes at the line, with the sortie's own tune: the held line no longer bleeds (SB-2262)
  for (let i = 0; i < 60 * 120; i++) stepCrowd(crowd, rng, DT, PLAY_BATTLE_TUNE, true);
  expect(crowd.fallen).toBe(0);
  expect(crowd.soldiers.filter(soldier => soldier.alive)).toHaveLength(300);
});

// How many of 300 soldiers waiting at the line fall in `seconds`, with the held line's loss set as given (SB-2020).
function heldLoss(seconds: number, loss: Partial<FxTune>, startHeld = 0): number {
  const tune = tuneWith({ allyDeathRate: 0, allyWaves: 0, allySpeed: 100, ...loss });
  const crowd = newCrowd();
  const rng = createRng(21);
  spawnWave(crowd, rng, BOUNDS, 300, tune);
  crowd.holdZ = 150;
  // let them all reach the line first (no loss yet), then set how long it has been held
  for (let i = 0; i < 60 * 3; i++) stepCrowd(crowd, rng, DT, tune, true);
  crowd.holdT = startHeld;
  for (let i = 0; i < Math.round(seconds / DT); i++) stepCrowd(crowd, rng, DT, tune, true);
  return crowd.fallen;
}

test('a held line loses soldiers, more the longer it has been held, and never faster than holdLossMax', () => {
  const none = heldLoss(2, { holdLossRate: 0, holdLossRamp: 0, holdLossMax: 0.12 });
  expect(none).toBe(0);
  const ramp = { holdLossRate: 0.02, holdLossRamp: 0.05, holdLossMax: 0.5 };
  // the same two seconds cost more once the line has already waited
  expect(heldLoss(2, ramp, 10)).toBeGreaterThan(heldLoss(2, ramp, 0));
  // past the cap the loss stops growing: waiting 10 s more costs the same as waiting 100 s more
  const capped = { holdLossRate: 0.02, holdLossRamp: 0.05, holdLossMax: 0.1 };
  expect(heldLoss(2, capped, 10)).toBe(heldLoss(2, capped, 100));
  // a lower cap loses fewer
  expect(heldLoss(2, { ...capped, holdLossMax: 0.05 }, 100)).toBeLessThan(heldLoss(2, capped, 100));
});

// SB-2044: a soldier far behind the mech hurries after it, and a new wave comes in behind the mech once it has gone on.
test('a soldier behind the mech walks faster the farther it falls back, and at the pace within the gap', () => {
  const tune = tuneWith({ allySpeed: 3, allyCatchGap: 40, allyCatchMul: 3 });
  expect(catchUp(50, undefined, tune)).toBe(1);
  expect(catchUp(50, 20, tune)).toBe(1); // 30 m behind, inside the gap
  expect(catchUp(50, 10, tune)).toBe(1); // exactly at the gap
  expect(catchUp(70, 10, tune)).toBeCloseTo(2, 6); // 20 m past the gap, half the ramp
  expect(catchUp(90, 10, tune)).toBeCloseTo(3, 6);
  expect(catchUp(500, 10, tune)).toBeCloseTo(3, 6);
  expect(catchUp(-50, 10, tune)).toBe(1); // ahead of the mech
  expect(catchUp(500, 10, tuneWith({ allyCatchMul: 1 }))).toBe(1);
});

test('stepCrowd walks a soldier far behind the leader at the faster pace', () => {
  const tune = tuneWith({ allyDeathRate: 0, allyWaves: 0, allySpeed: 3, allyCatchGap: 40, allyCatchMul: 3 });
  const crowd = newCrowd();
  const rng = createRng(2);
  spawnWave(crowd, rng, BOUNDS, 1, tune);
  const start = crowd.soldiers[0].z;
  for (let i = 0; i < 60; i++) stepCrowd(crowd, rng, DT, tune, false, -500);
  expect(start - crowd.soldiers[0].z).toBeCloseTo(9, 6);
});

test('a wave comes in just behind the mech once it is past the sea edge, and at the sea edge before', () => {
  const tune = tuneWith({ allySpawnBehind: 60, allyWaves: 0, allyDeathRate: 0 });
  const crowd = newCrowd();
  const rng = createRng(4);
  stepCrowd(crowd, rng, DT, tune, false, 20);
  spawnWave(crowd, rng, BOUNDS, 6, tune);
  for (const soldier of crowd.soldiers) {
    expect(soldier.z).toBeLessThanOrEqual(80);
    expect(soldier.z).toBeGreaterThan(60); // within the spawn depth of the mech's z + 60 (the squads' rear ranks stand behind)
  }
  const early = newCrowd();
  stepCrowd(early, rng, DT, tune, false, 150);
  spawnWave(early, rng, BOUNDS, 6, tune);
  for (const soldier of early.soldiers) expect(soldier.z).toBeGreaterThan(BOUNDS.maxZ - 12);
  // the default tune keeps the sea edge
  const plain = newCrowd();
  stepCrowd(plain, rng, DT, FX_TUNE, false, 20);
  spawnWave(plain, rng, BOUNDS, 6, FX_TUNE);
  for (const soldier of plain.soldiers) expect(soldier.z).toBeGreaterThan(BOUNDS.maxZ - 12);
});
