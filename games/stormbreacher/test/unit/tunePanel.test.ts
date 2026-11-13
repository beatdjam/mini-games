// The tuning panel's copy text: only the values that differ from the snapshot, in the shape of the source table.
import { expect, test } from 'vitest';
import { changedValuesText, tuneNumber } from '../../src/dev/tunePanel.ts';

test('only the changed values are copied, by the table and key names', () => {
  const table = { fire: { radius: 6.4, life: 0.7 }, smoke: { count: 34, rise: 3 } };
  const baseline = {
    'fire.radius': 5.4,
    'fire.life': 0.7,
    'smoke.count': 34,
    'smoke.rise': 2.5,
  };
  const text = changedValuesText('BOOM_DEFS.large', table, baseline, [
    'fire.radius',
    'fire.life',
    'smoke.count',
    'smoke.rise',
  ]);
  expect(text).toBe('BOOM_DEFS.large.fire.radius: 6.4\nBOOM_DEFS.large.smoke.rise: 3');
});

test('a table with nothing changed copies nothing', () => {
  const table = { walk: 7.5, jump: 7.2 };
  expect(changedValuesText('MOVE_TUNE', table, { walk: 7.5, jump: 7.2 }, ['walk', 'jump'])).toBe('');
});

test('a number is written as the source would write it', () => {
  expect(tuneNumber(1.25)).toBe('1.25');
  expect(tuneNumber(7)).toBe('7');
  // the noise a slider step or a number field can leave behind is dropped
  expect(tuneNumber(0.30000000000000004)).toBe('0.3');
  expect(tuneNumber(1 / 120)).toBe('0.00833333333333');
});
