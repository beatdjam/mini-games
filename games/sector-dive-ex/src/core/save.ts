import type { SaveData, WeaponItem } from '../data/types.ts';
import { isTouch } from '@engine/core/util.ts';
import { decodeStore, encodeStore, loadStore, saveStore } from '@engine/core/store.ts';
import { setVolumes } from '@engine/audio/audio.ts';
// Save data: defaults and conversions from older versions (reading / writing is engine/src/core/store.ts)
export const SAVE_KEY = 'sector-dive-ex-v1';
export const BASE_TAB_KEY = 'sdx-base-tab'; // the base tab last opened (a preference, kept apart from the save)
export const basicW = (id: string): WeaponItem => ({ id, r: 0, basic: true });
export const defaultSave = (): SaveData => ({
  bits: 0,
  up: { hp: 0, dmg: 0, spd: 0, dash: 0, stam: 0, gain: 0, kit: 0, chip: 0, choice: 0 },
  unlocked: { pistol: true },
  loadout: [basicW('pistol'), null],
  stash: [],
  shortcut: 0,
  startTier: 0,
  peak: 0,
  best: 0,
  runs: 0,
  bossKills: 0,
  bossSeen: {},
  stageV: 2,
  mods: {},
  levelV: 1,
  suspend: null,
  settings: {
    lang: null,
    autofire: isTouch,
    assist: 'weak',
    sens: 1,
    bgm: 0.6,
    sfx: 1,
    leftFire: true,
    stickDash: false,
    layout: {},
    keys: {}, // only the actions the player changed (changedBindings); the rest use KEY_ACTIONS' defaults
  },
});
function loadSave(): SaveData {
  const { data: out, raw: s } = loadStore(SAVE_KEY, defaultSave);
  if (!s) return out;
  const assist: unknown = out.settings.assist; // saves from before the setting had levels hold a boolean
  if (typeof assist === 'boolean') out.settings.assist = assist ? 'weak' : 'off';
  if (!Array.isArray(out.loadout))
    out.loadout = [basicW(s.weapon && out.unlocked[s.weapon] ? s.weapon : 'pistol'), null];
  if (!out.loadout[0]) out.loadout[0] = basicW('pistol');
  if (!Array.isArray(out.stash)) out.stash = [];
  // stageV 2: depths went from 4 floors + boss to 3 floors + boss; convert stage numbers saved under the old layout
  if (s.stageV !== 2) {
    const conv = (st: number) => Math.floor(st / 5) * 4 + [0, 1, 2, 2, 3][st % 5];
    if (out.best) out.best = conv(out.best - 1) + 1;
    if (out.suspend && out.suspend.run) out.suspend.run.stage = conv(out.suspend.run.stage);
    out.stageV = 2;
  }
  // levelV 1 (2026-10-17): the base upgrades and the reboot became the level. The points in the base upgrades stay as
  // they were; the reboot's bonuses become points of what they were like (its +10 max HP a level, two thirds of an
  // armour point; its +5% max HP a level, about the same; its +5% damage, five eighths of an output point; the wider
  // chip choice as it was). Its starting bits, relic weapons and bit gain, and the points not spent, are dropped.
  // Enemies are no longer stronger after a reboot
  if (s.levelV !== 1) {
    const pu = out.pres?.up ?? {};
    out.up.hp = (out.up.hp || 0) + Math.round(((pu.hp || 0) * 10) / 15 + (pu.vit || 0) * 0.67);
    out.up.dmg = (out.up.dmg || 0) + Math.round(((pu.dmg || 0) * 5) / 8);
    out.up.choice = Math.max(out.up.choice || 0, pu.choice || 0);
    delete out.pres;
    delete out.canReboot;
    out.levelV = 1;
  }
  return out;
}
// the save data; replaced only through setSave
export let save = loadSave();
export function setSave(s: SaveData) {
  save = s;
}
// the engine's audio reads its volumes from these
export function syncVolumes() {
  setVolumes(save.settings.sfx ?? 1, save.settings.bgm ?? 0.6);
}
export function persist() {
  saveStore(SAVE_KEY, save);
}
// save codes for moving a save between devices (settings tab > data; the format is engine/src/core/store.ts encodeStore)
const SAVE_CODE_TAG = 'SDX1';
export const exportSave = (): string => encodeStore(SAVE_CODE_TAG, save);
// false when the code isn't a Sector Dive Extended save. On success the save is stored and read back like one at start-up
// (defaults filled in, old formats converted); the caller reloads the page so every screen picks it up
const readCode = (code: string): object | null => {
  const obj = decodeStore(SAVE_CODE_TAG, code);
  return obj && typeof obj === 'object' && !Array.isArray(obj) && 'bits' in obj ? obj : null;
};
export const importSaveCheck = (code: string): boolean => !!readCode(code);
export function importSave(code: string): boolean {
  const obj = readCode(code);
  if (!obj) return false;
  saveStore(SAVE_KEY, obj);
  setSave(loadSave());
  return true;
}
