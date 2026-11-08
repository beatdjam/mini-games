// Save data: the campaign's progress and the settings. Reading and writing storage is the engine's (core/store.ts);
// the keys, the version and the conversions from older versions are here.
import { loadStore, saveStore } from '@engine/core/index.ts';

// The campaign's progress. The version is SAVE_VERSION; raise it when the shape changes and add a MIGRATIONS entry.
export const SAVE_KEY = 'stormbreacher-v1';
// The settings (the language), one copy for every mode, kept apart from the progress.
export const SETTINGS_KEY = 'stormbreacher-settings';

export const SAVE_VERSION = 1;

// One mission's record: cleared, and the best time in seconds (null until there is one).
export interface MissionRecord {
  cleared: boolean;
  bestSec: number | null;
}

export interface SaveData {
  v: number;
  records: {
    missions: Record<string, MissionRecord>;
  };
}

export interface Settings {
  lang: string | null;
}

export const defaultSave = (): SaveData => ({
  v: SAVE_VERSION,
  records: { missions: {} },
});

export const defaultSettings = (): Settings => ({ lang: null });

// The conversions from older versions, in order (to = the version whose shape the function makes), with the save as it
// is stored. Empty for now; when the version goes up, add each step here.
export const MIGRATIONS: [to: number, migrate: (out: SaveData, raw: Record<string, unknown>) => void][] = [];

// Reads one save (the game reads SAVE_KEY; the key is for the tests). A stored save without `v` counts as version 0,
// and every conversion above it runs in order; the result is the current version.
export function loadSave(key = SAVE_KEY): SaveData {
  const { data, raw } = loadStore<SaveData>(key, defaultSave);
  const v = typeof raw?.v === 'number' ? raw.v : 0;
  if (raw) for (const [to, migrate] of MIGRATIONS) if (to > v) migrate(data, raw);
  data.v = SAVE_VERSION;
  return data;
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
