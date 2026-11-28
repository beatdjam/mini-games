// The enemies' fire at the infantry (SB-2271): who is picked, what a shot does to a soldier and how a machine-gun
// nest's sweep spreads it. The small crowds are built by hand; the values come from INFANTRY_TUNE.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { ENEMIES } from '../../src/data/enemies.ts';
import { INFANTRY_TUNE, type InfantryTune } from '../../src/data/tune.ts';
import { isPosted, newCrowd, type Crowd, type Soldier } from '../../src/logic/crowd.ts';
import type { Aabb } from '../../src/logic/fire.ts';
import { fireAtInfantry, pickInfantry, targetsInfantry, type InfantryShooter } from '../../src/logic/infantryFire.ts';

function soldierAt(x: number, z: number, changes: Partial<Soldier> = {}): Soldier {
  return {
    x,
    z,
    yaw: 0,
    alive: true,
    deadT: 0,
    phase: 0,
    squad: 0,
    fallAt: null,
    waited: false,
    post: null,
    hp: INFANTRY_TUNE.hp,
    targetedT: 0,
    ...changes,
  };
}

function crowdOf(...soldiers: Soldier[]): Crowd {
  const crowd = newCrowd();
  crowd.soldiers = soldiers;
  // the waiting line stands where the soldiers that waited are: at their z, or 0 in these small crowds
  const waiter = soldiers.find(soldier => soldier.waited);
  if (waiter !== undefined) crowd.holdZ = waiter.z;
  return crowd;
}

function grunt(x = 0, z = 0): InfantryShooter {
  return { kind: 'grunt', x, z };
}

function tuneWith(changes: Partial<InfantryTune>): InfantryTune {
  return { ...INFANTRY_TUNE, ...changes };
}

test('a soldier still walking is picked before one that has taken its ground', () => {
  const posted = soldierAt(1, 0, { waited: true });
  const walking = soldierAt(5, 0);
  const crowd = crowdOf(posted, walking);
  expect(pickInfantry(crowd, grunt(), [])).toBe(walking);
  // with the walking soldier out of reach, the posted one is picked
  walking.x = ENEMIES.grunt.fireRange + 1;
  expect(pickInfantry(crowd, grunt(), [])).toBe(posted);
});

test('a soldier that waited once but walks on from the line is a walking target again', () => {
  const crowd = crowdOf(soldierAt(0, -10, { waited: true }));
  const soldier = crowd.soldiers[0];
  expect(isPosted(crowd, soldier)).toBe(true);
  // the line moves inland: it is no longer at the line, so it is picked and hurt as a walking soldier
  crowd.holdZ = -50;
  expect(isPosted(crowd, soldier)).toBe(false);
  crowd.holdZ = null;
  expect(isPosted(crowd, soldier)).toBe(false);
  // a posted one stays posted whatever the line does
  soldier.post = { x: 0, z: -10 };
  expect(isPosted(crowd, soldier)).toBe(true);
});

test('a machine-gun nest’s sweep does not reach a soldier behind a prop', () => {
  const hit = tuneWith({ hitChance: 1 });
  const picked = soldierAt(0, -10);
  const hidden = soldierAt(2.5, -10);
  const wall: Aabb = { minX: 1.5, maxX: 3.5, minY: 0, maxY: 3, minZ: -6, maxZ: -4 };
  const shots = fireAtInfantry(crowdOf(picked, hidden), { kind: 'emplacement', x: 0, z: 0 }, [wall], createRng(1), hit);
  expect(shots.map(shot => shot.soldier)).toEqual([picked]);
  expect(hidden.hp).toBe(INFANTRY_TUNE.hp);
});

test('a soldier out of range or behind a prop is not picked', () => {
  const far = soldierAt(0, -ENEMIES.grunt.fireRange - 1);
  expect(pickInfantry(crowdOf(far), grunt(), [])).toBeNull();
  const near = soldierAt(0, -10);
  const wall: Aabb = { minX: -5, maxX: 5, minY: 0, maxY: 3, minZ: -6, maxZ: -4 };
  expect(pickInfantry(crowdOf(near), grunt(), [wall])).toBeNull();
  expect(pickInfantry(crowdOf(near), grunt(), [])).toBe(near);
});

test('a shot does less to a posted soldier than to one still walking', () => {
  const hit = tuneWith({ hitChance: 1 });
  const walking = soldierAt(0, -10);
  fireAtInfantry(crowdOf(walking), grunt(), [], createRng(1), hit);
  expect(walking.hp).toBeCloseTo(INFANTRY_TUNE.hp - INFANTRY_TUNE.shotDamage.grunt, 6);
  const posted = soldierAt(0, -10, { waited: true });
  fireAtInfantry(crowdOf(posted), grunt(), [], createRng(1), hit);
  expect(posted.hp).toBeCloseTo(INFANTRY_TUNE.hp - INFANTRY_TUNE.shotDamage.grunt * INFANTRY_TUNE.postedMul, 6);
});

test('a machine-gun nest’s shot sweeps every soldier near the one it picked', () => {
  const hit = tuneWith({ hitChance: 1 });
  const picked = soldierAt(0, -10);
  const near = soldierAt(2, -10);
  const far = soldierAt(INFANTRY_TUNE.sweepRadius + 2, -10);
  const crowd = crowdOf(picked, near, far);
  const shots = fireAtInfantry(crowd, { kind: 'emplacement', x: 0, z: 0 }, [], createRng(1), hit);
  expect(shots.map(shot => shot.soldier)).toEqual([picked, near]);
  expect(picked.hp).toBe(INFANTRY_TUNE.hp - INFANTRY_TUNE.shotDamage.emplacement);
  expect(near.hp).toBe(INFANTRY_TUNE.hp - INFANTRY_TUNE.shotDamage.emplacement);
  expect(far.hp).toBe(INFANTRY_TUNE.hp);
});

test('a hit chance of 0 misses and one of 1 hits', () => {
  const sure = tuneWith({ hitChance: 1 });
  const certain = soldierAt(0, -10);
  const hit = fireAtInfantry(crowdOf(certain), grunt(), [], createRng(1), sure);
  expect(hit[0].hit).toBe(true);
  expect(certain.hp).toBeLessThan(INFANTRY_TUNE.hp);

  const never = tuneWith({ hitChance: 0 });
  const missed = soldierAt(0, -10);
  const miss = fireAtInfantry(crowdOf(missed), grunt(), [], createRng(1), never);
  expect(miss[0].hit).toBe(false);
  expect(missed.hp).toBe(INFANTRY_TUNE.hp);
  // the shot still aimed at the soldier, so its mark starts
  expect(miss[0].targeted).toBe(true);
  expect(missed.targetedT).toBeCloseTo(INFANTRY_TUNE.targetedSec, 6);
});

test('the target share decides whether a shot goes at the infantry', () => {
  expect(targetsInfantry(createRng(1), tuneWith({ targetShare: 0 }))).toBe(false);
  expect(targetsInfantry(createRng(1), tuneWith({ targetShare: 1 }))).toBe(true);
});
