// The boss tuning numbers (BOSS_TUNE) and the two clocks bosses/common.ts keeps from them: the attack patterns and the
// phase boundaries. No game is started: these only read a few fields of a boss.
import { expect, test } from 'vitest';
import type { Boss } from '../src/data/types.ts';
import { BOSS_TUNE } from '../src/data/bosses.ts';
import { nextPattern, phaseOf } from '../src/actors/bosses/common.ts';

// only the fields these two read (a whole boss needs a mesh and the arena)
const boss = (hp: number, maxHp: number): Boss => ({ hp, maxHp, patIdx: 0, pat: -1, pt: 1, shots: 1, acc: 1 }) as Boss;

test('boss tune: nextPattern cycles the patterns and clears the clocks', () => {
  const e = boss(1000, 1000);
  const pats = [0, 1, 2, 3].map(() => {
    nextPattern(e);
    expect(e.pt).toBe(0);
    expect(e.shots).toBe(0);
    expect(e.acc).toBe(0);
    return e.pat;
  });
  expect(pats).toEqual([0, 1, 2, 0]);
});
test('boss tune: phaseOf counts the boundaries its health has passed', () => {
  expect(BOSS_TUNE.phases).toEqual([0.5]);
  expect(phaseOf(boss(1000, 1000)), 'at full health').toBe(0);
  expect(phaseOf(boss(500, 1000)), 'at the boundary').toBe(0);
  expect(phaseOf(boss(499, 1000)), 'below the boundary').toBe(1);
});
