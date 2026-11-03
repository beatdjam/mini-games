// Smoke test for Sector Dive Extended's modes: ARCADE and ENDLESS have a save and a suspended dive each, and share their
// settings. Boots the game page once (bootGame) for the wipe button and a real checkpoint; the save functions are also
// tried on their own.
import { beforeAll, expect, test } from 'vitest';
import { clearStore, loadStore, saveStore } from '@engine/core/store.ts';
import { el } from '@engine/core/util.ts';
import {
  ACTIVE_SAVE_KEY,
  ARCADE_SAVE_KEY,
  BOSS_RUSH_HASH,
  BOT_CLIMB_HASH,
  SAVE_KEY,
  SETTINGS_KEY,
  defaultSave,
  hasSuspendIn,
  loadSaveFrom,
  persist,
  save,
  saveKeyFor,
} from '../src/core/save.ts';
import { bootGame } from './helpers.ts';

beforeAll(bootGame);

const restore = (key: string, value: string | null) =>
  value === null ? clearStore(key) : localStorage.setItem(key, value);

test('save keys: each mode has its own save; the dev views keep theirs', () => {
  expect(saveKeyFor('', false, 'endless')).toBe(SAVE_KEY);
  expect(saveKeyFor('', false, 'arcade')).toBe(ARCADE_SAVE_KEY);
  expect(saveKeyFor('', true, 'arcade'), 'the dev server can open ARCADE').toBe(ARCADE_SAVE_KEY);
  expect(saveKeyFor(BOSS_RUSH_HASH, true, 'endless')).toBe(`${SAVE_KEY}-bossrush`);
  expect(saveKeyFor(BOSS_RUSH_HASH, true, 'arcade'), 'the dev view comes before the mode').toBe(`${SAVE_KEY}-bossrush`);
  expect(saveKeyFor(`${BOT_CLIMB_HASH}-new`, true, 'arcade')).toBe(`${SAVE_KEY}-climber`);
});

test('settings: with no shared copy, ARCADE takes the ENDLESS save settings', () => {
  const endlessBefore = localStorage.getItem(SAVE_KEY),
    settingsBefore = localStorage.getItem(SETTINGS_KEY);
  try {
    clearStore(SETTINGS_KEY);
    clearStore(ARCADE_SAVE_KEY);
    const endless = defaultSave();
    endless.settings.lang = 'ja';
    endless.settings.sfx = 0.123;
    saveStore(SAVE_KEY, endless);
    const arcade = loadSaveFrom(ARCADE_SAVE_KEY);
    expect([arcade.settings.lang, arcade.settings.sfx]).toEqual(['ja', 0.123]);
  } finally {
    restore(SAVE_KEY, endlessBefore);
    restore(SETTINGS_KEY, settingsBefore);
  }
});

test('persist: the settings are written apart from the save', () => {
  const keep = save.settings.sfx;
  save.settings.sfx = 0.321;
  persist();
  expect(loadStore(SETTINGS_KEY, () => defaultSave().settings).data.sfx).toBe(0.321);
  save.settings.sfx = keep;
  persist();
});

test('suspend: a dive in one mode does not appear in the other', () => {
  expect(ACTIVE_SAVE_KEY, 'the tests play ENDLESS').toBe(SAVE_KEY);
  const snap = save.suspend;
  expect(snap, 'bootGame starts a dive, whose checkpoint is in the save').toBeTruthy();
  clearStore(ARCADE_SAVE_KEY);
  saveStore(ARCADE_SAVE_KEY, { ...defaultSave(), suspend: snap });
  expect([hasSuspendIn('arcade'), hasSuspendIn('endless')]).toEqual([true, true]);
  // drop ENDLESS's checkpoint: ARCADE's stays
  const endless = loadSaveFrom(SAVE_KEY);
  endless.suspend = null;
  saveStore(SAVE_KEY, endless);
  expect([hasSuspendIn('arcade'), hasSuspendIn('endless')]).toEqual([true, false]);
});

test('wipe: only the current mode save goes; the other mode keeps its save', () => {
  clearStore(ARCADE_SAVE_KEY);
  saveStore(ARCADE_SAVE_KEY, { ...defaultSave(), bits: 4242 });
  save.bits = 999;
  persist();
  el('#btnWipe').click();
  el('#btnWipeGo').click();
  expect(save.bits).toBe(0);
  expect(loadSaveFrom(ARCADE_SAVE_KEY).bits).toBe(4242);
  expect(loadStore(SETTINGS_KEY, () => defaultSave().settings).data).toEqual(defaultSave().settings);
});
