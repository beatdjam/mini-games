import { expect, test } from 'vitest';
import { GAIT_KINDS, M1_MECH, PART_IDS, PARTS, type MechBuild } from '../../src/data/mech.ts';
import { LEG_MOVE_TUNE, MOVE_TUNE } from '../../src/data/tune.ts';
import { moveTuneOf } from '../../src/logic/mechTune.ts';

const withLegs = (legs: MechBuild['legs']): MechBuild => ({ ...M1_MECH, legs });

test('every legs part has a gait, and every gait has an override', () => {
  for (const id of PART_IDS.legs) expect(GAIT_KINDS).toContain(PARTS.legs[id].gait);
  expect(Object.keys(LEG_MOVE_TUNE).sort()).toEqual([...GAIT_KINDS].sort());
});

test('M1 mech is the biped and its tune is MOVE_TUNE as it is', () => {
  expect(PARTS.legs[M1_MECH.legs].gait).toBe('biped');
  expect(moveTuneOf(M1_MECH)).toEqual(MOVE_TUNE);
  expect(moveTuneOf(withLegs('stoutLegs'))).toEqual(MOVE_TUNE);
});

test('reverse-joint legs are faster, jump higher and boost longer than the biped', () => {
  const tune = moveTuneOf(withLegs('reverseLegs'));
  expect(tune.walk).toBeGreaterThan(MOVE_TUNE.walk);
  expect(tune.jump).toBeGreaterThan(MOVE_TUNE.jump);
  expect(tune.boostDrain).toBeLessThan(MOVE_TUNE.boostDrain);
});

test('multi legs are slower and jump lower than the biped', () => {
  const tune = moveTuneOf(withLegs('quadLegs'));
  expect(tune.walk).toBeLessThan(MOVE_TUNE.walk);
  expect(tune.jump).toBeLessThan(MOVE_TUNE.jump);
});

test('an override changes only the items it names, and leaves the base alone', () => {
  const before = { ...MOVE_TUNE };
  const tune = moveTuneOf(withLegs('reverseLegs'));
  const changed = Object.keys(LEG_MOVE_TUNE.reverse);
  for (const key of Object.keys(MOVE_TUNE) as (keyof typeof MOVE_TUNE)[])
    if (!changed.includes(key)) expect(tune[key]).toBe(MOVE_TUNE[key]);
  expect(MOVE_TUNE).toEqual(before);
});
