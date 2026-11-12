// Save data in the browser's storage: the keys, reading at start-up and writing back. The shape and the conversions
// from older versions are in logic/save.ts; reading and writing storage is the engine's (core/store.ts).
import { clearStore, loadStore, saveStore } from '@engine/core/index.ts';
import type { GameModel } from '../logic/game.ts';
import type { TouchPlace } from '../data/touch.ts';
import { defaultSave, defaultSettings, migrateSave, type SaveData, type Settings } from '../logic/save.ts';
import { restoreSuspend, suspendOf } from '../logic/suspend.ts';

// The campaign's progress. The version is SAVE_VERSION; raise it when the shape changes and add a MIGRATIONS entry.
export const SAVE_KEY = 'stormbreacher-v1';
// The settings (the language), one copy for every mode, kept apart from the progress.
export const SETTINGS_KEY = 'stormbreacher-settings';
// The touch buttons' edits (position and size), kept apart from the settings.
export const TOUCH_LAYOUT_KEY = 'stormbreacher-touch-layout';

// The suspended sortie (one at most), kept apart from the progress. The version is SUSPEND_VERSION in logic/suspend.ts;
// a suspend of another version is thrown away, not converted.
export const SUSPEND_KEY = 'stormbreacher-suspend';

export type TouchEdits = Record<string, TouchPlace>;

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

export function loadTouchEdits(): TouchEdits {
  return loadStore<TouchEdits>(TOUCH_LAYOUT_KEY, () => ({})).data;
}

export function saveTouchEdits(edits: TouchEdits) {
  saveStore(TOUCH_LAYOUT_KEY, edits);
}

export function clearTouchEdits() {
  clearStore(TOUCH_LAYOUT_KEY);
}

// The suspended sortie as a game, or null when there is none. One that cannot be read (another version, damaged) is
// removed, so the title does not offer a "continue" that fails.
export function loadSuspend(): GameModel | null {
  let text: string | null = null;
  let stored: unknown = null;
  try {
    text = localStorage.getItem(SUSPEND_KEY);
    if (text !== null) stored = JSON.parse(text);
  } catch (e) {
    // storage that cannot be read, or text that is not JSON: handled as a suspend that cannot be read
  }
  if (text === null) return null;
  const game = restoreSuspend(stored);
  if (game === null) clearStore(SUSPEND_KEY);
  return game;
}

export function writeSuspend(game: GameModel) {
  saveStore(SUSPEND_KEY, suspendOf(game));
}

export function clearSuspend() {
  clearStore(SUSPEND_KEY);
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
