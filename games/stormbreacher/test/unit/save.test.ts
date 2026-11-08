import { expect, test } from 'vitest';
import { SAVE_VERSION, defaultSave, migrateSave } from '../../src/logic/save.ts';

test('a save with no stored data is the default', () => {
  expect(migrateSave(defaultSave(), null)).toEqual(defaultSave());
});

test('an old save without a version is converted and kept', () => {
  const raw = { records: { missions: { m1: { cleared: true, bestSec: 300 } } } };
  const data = { ...defaultSave(), records: { missions: { m1: { cleared: true, bestSec: 300 } } } };
  const migrated = migrateSave(data, raw);
  expect(migrated.v).toBe(SAVE_VERSION);
  expect(migrated.records.missions.m1).toEqual({ cleared: true, bestSec: 300 });
});
