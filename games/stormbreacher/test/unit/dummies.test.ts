import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { DUMMY_TUNE } from '../../src/data/tune.ts';
import { hitDummy, spawnDummies, stepDummies } from '../../src/logic/dummies.ts';

test('the same seed makes the same eight dummies', () => {
  const a = spawnDummies(createRng(7));
  const b = spawnDummies(createRng(7));
  expect(a).toHaveLength(8);
  expect(a).toEqual(b);
});

test('a dummy goes down after hp hits and comes back after respawn', () => {
  const list = spawnDummies(createRng(1));
  const dummy = list[0];
  dummy.move = 'still';
  for (let i = 0; i < DUMMY_TUNE.hp - 1; i++) expect(hitDummy(dummy, DUMMY_TUNE)).toBe(false);
  expect(hitDummy(dummy, DUMMY_TUNE)).toBe(true);
  expect(dummy.deadT).toBe(DUMMY_TUNE.respawn);

  stepDummies(list, DUMMY_TUNE.respawn + 1 / 60, DUMMY_TUNE);
  expect(dummy.hp).toBe(DUMMY_TUNE.hp);
  expect(dummy.deadT).toBe(0);
  expect(dummy.x).toBeCloseTo(dummy.homeX, 10);
  expect(dummy.z).toBeCloseTo(dummy.homeZ, 10);
});

test('a strafing dummy moves within two seconds', () => {
  const list = spawnDummies(createRng(5));
  const dummy = list.find(d => d.move === 'strafe');
  expect(dummy).toBeDefined();
  if (!dummy) return;
  const startX = dummy.x;
  let moved = false;
  for (let i = 0; i < 120; i++) {
    stepDummies(list, 1 / 60, DUMMY_TUNE);
    if (Math.abs(dummy.x - startX) > 1) moved = true;
  }
  expect(moved).toBe(true);
});
