import { expect, test } from 'vitest';
import { seed, rng, stream } from '../src/core/rng.ts';
import {
  SAVE_KEY,
  SAVE_VERSION,
  SETTINGS_KEY,
  defaultSave,
  initSave,
  loadSave,
  saveSettings,
  writeSave,
} from '../src/core/save.ts';
import { STATES } from '../src/data/states.ts';

// the first values of a generator: what a seed must give again
const first = (n: number): number[] => {
  seed(7);
  const r = rng();
  return Array.from({ length: n }, () => r.next());
};

test('the seed makes the same sequence', () => {
  const a = first(3);
  const b = first(3);
  expect(a).toEqual(b);
});

test('a stream gets a different sequence from the seed', () => {
  seed(7);
  const fromStream = stream('field').next();
  const fromMain = rng().next();
  expect(fromStream).not.toBe(fromMain);
});

test('a save with no stored data is the default', () => {
  localStorage.removeItem(SAVE_KEY);
  expect(loadSave()).toEqual(defaultSave());
});

test('an old save without a version is read and kept', () => {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ records: { missions: { m1: { cleared: true, bestSec: 300 } } } }));
  const old = loadSave();
  expect(old.v).toBe(SAVE_VERSION);
  expect(old.records.missions.m1).toEqual({ cleared: true, bestSec: 300 });
  localStorage.removeItem(SAVE_KEY);
});

test('settings and progress are stored under separate keys', () => {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(SETTINGS_KEY);
  initSave();
  saveSettings();
  expect(localStorage.getItem(SETTINGS_KEY)).not.toBeNull();
  expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  writeSave();
  expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(SETTINGS_KEY);
});

test('the state table lists every game state', () => {
  expect(Object.keys(STATES)).toEqual(['title']);
});
