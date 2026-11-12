import { expect, test } from 'vitest';
import { ECONOMY } from '../../src/data/economy.ts';
import type { Payout } from '../../src/logic/economy.ts';
import { SAVE_VERSION, defaultSave, migrateSave, recordClear } from '../../src/logic/save.ts';

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

test('a version 1 save is converted to version 2: the funds are the start funds and the records stay', () => {
  // a version 1 save as it was stored: no `funds`
  const raw = { v: 1, records: { missions: { m1: { cleared: true, bestSec: 300 } } } };
  const data = { ...defaultSave(), records: structuredClone(raw.records), v: 1 };
  Reflect.deleteProperty(data, 'funds');
  const migrated = migrateSave(data, raw);
  expect(SAVE_VERSION).toBe(2);
  expect(migrated.v).toBe(2);
  expect(migrated.funds).toBe(ECONOMY.startFunds);
  expect(migrated.records.missions.m1).toEqual({ cleared: true, bestSec: 300 });
});

test('a version 2 save keeps its funds', () => {
  const raw = { v: 2, funds: 4000, records: { missions: {} } };
  const migrated = migrateSave({ ...defaultSave(), funds: 4000 }, raw);
  expect(migrated.funds).toBe(4000);
});

const payout = (net: number, credited: boolean): Payout => ({
  base: 0,
  bonuses: {
    depot: { earned: false, amount: 0 },
    par: { earned: false, amount: 0 },
    noRetry: { earned: false, amount: 0 },
  },
  ammo: 0,
  repair: 0,
  retries: 0,
  retryCost: 0,
  net,
  credited,
});

test('recordClear adds a credited take-home and keeps the best time', () => {
  const data = defaultSave();
  recordClear(data, 'm1', 400, payout(5000, true));
  expect(data.funds).toBe(5000);
  expect(data.records.missions.m1).toEqual({ cleared: true, bestSec: 400 });
  recordClear(data, 'm1', 500, payout(5000, false));
  expect(data.funds).toBe(5000);
  expect(data.records.missions.m1).toEqual({ cleared: true, bestSec: 400 });
  recordClear(data, 'm1', 300, payout(5000, false));
  expect(data.records.missions.m1.bestSec).toBe(300);
});
