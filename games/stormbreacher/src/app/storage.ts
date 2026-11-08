// Save data in the browser's storage: the keys, reading at start-up and writing back. The shape and the conversions
// from older versions are in logic/save.ts; reading and writing storage is the engine's (core/store.ts).
import { loadStore, saveStore } from '@engine/core/index.ts';
import { defaultSave, defaultSettings, migrateSave, type SaveData, type Settings } from '../logic/save.ts';

// The campaign's progress. The version is SAVE_VERSION; raise it when the shape changes and add a MIGRATIONS entry.
export const SAVE_KEY = 'stormbreacher-v1';
// The settings (the language), one copy for every mode, kept apart from the progress.
export const SETTINGS_KEY = 'stormbreacher-settings';

// Reads one save (the game reads SAVE_KEY; the key is for the tests).
export function loadSave(key = SAVE_KEY): SaveData {
  const { data, raw } = loadStore<SaveData>(key, defaultSave);
  return migrateSave(data, raw);
}

export function loadSettings(): Settings {
  return loadStore<Settings>(SETTINGS_KEY, defaultSettings).data;
}

export function saveSettings() {
  saveStore(SETTINGS_KEY, settings);
}

export function writeSave() {
  saveStore(SAVE_KEY, save);
}

// The save in use. Both are read by initSave() at start-up, not when this module loads.
export let save: SaveData = defaultSave();
export let settings: Settings = defaultSettings();

export function initSave() {
  save = loadSave();
  settings = loadSettings();
}
