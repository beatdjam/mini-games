import { expect, test } from 'vitest';
import { SAVE_KEY, SETTINGS_KEY, initSave, loadSave, saveSettings, writeSave } from '../../src/app/storage.ts';
import { SAVE_VERSION, defaultSave } from '../../src/logic/save.ts';

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
