import type { SaveData, WeaponItem } from '../data/types.ts';
import { isTouch } from '@engine/core/util.ts';
import { decodeStore, encodeStore, loadStore, saveStore } from '@engine/core/store.ts';
import { setVolumes } from '@engine/audio/audio.ts';
// Save data: defaults and conversions from older versions (reading / writing is engine/src/core/store.ts)
export const SAVE_KEY = 'sector-dive-ex-v1';
// dev: the way into the boss area to play it (dev/views/bossRush.ts) keeps a save of its own, so the real one is not touched
export const BOSS_RUSH_HASH = '#bossrush';
export const saveKeyFor = (hash: string, dev: boolean): string =>
  dev && hash.startsWith(BOSS_RUSH_HASH) ? `${SAVE_KEY}-bossrush` : SAVE_KEY;
export const ACTIVE_SAVE_KEY = saveKeyFor(location.hash, import.meta.env.DEV);
export const BASE_TAB_KEY = 'sdx-base-tab'; // the base tab last opened (a preference, kept apart from the save)
// the version of the save's shape (1: stageV, levelV and supplyV are one version, and records is added)
export const SAVE_VERSION = 1;
export const basicW = (id: string): WeaponItem => ({ id, r: 0, basic: true });
export const defaultSave = (): SaveData => ({
  v: SAVE_VERSION,
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
  records: { cleared: false, bossArea: null },
  // the marks an older version of the game reads. Their values are fixed; they are not used to tell this save's version
  stageV: 2,
  levelV: 1,
  supplyV: 1,
  mods: {},
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
// the old fields (from before the level, 2026-10-17) are read once and then left out of the save
type LegacySave = SaveData & { canReboot?: boolean; pres?: { count: number; pts: number; up: Record<string, number> } };
// each mark is read from the save as stored, so a save that has it missing is converted the same way as one with the old value
function migrateTo1(out: SaveData, raw: Record<string, any>) {
  // stageV 2: convert stage numbers saved under the old layout
  if (raw.stageV !== 2) {
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
  if (raw.levelV !== 1) {
    const old = out as LegacySave;
    const pu = old.pres?.up ?? {};
    out.up.hp = (out.up.hp || 0) + Math.round(((pu.hp || 0) * 10) / 15 + (pu.vit || 0) * 0.67);
    out.up.dmg = (out.up.dmg || 0) + Math.round(((pu.dmg || 0) * 5) / 8);
    out.up.choice = Math.max(out.up.choice || 0, pu.choice || 0);
    delete old.pres;
    delete old.canReboot;
    out.levelV = 1;
  }
  // supplyV 1 (2026-10-17): base weapons are no longer modded (they are issued for the start depth). The bits spent on
  // their + values and rarities come back, to spend on levels (the prices as they were: 50 x 1.5 a step up to +10, 1.2
  // a step after it; 300 to the 2nd rarity, 900 more to the 3rd)
  if (raw.supplyV !== 1) {
    const plusCost = (p: number) =>
      Math.round(50 * Math.pow(1.5, Math.min(p, 10)) * Math.pow(1.2, Math.max(0, p - 10)));
    for (const m of Object.values(out.mods || {})) {
      for (let p = 0; p < (m.plus || 0); p++) out.bits += plusCost(p);
      out.bits += [0, 300, 1200][m.r || 0] ?? 0;
    }
    out.mods = {};
    out.supplyV = 1;
  }
  // the defaults give it, but an old save may carry records as nothing; keep the shape settled from here on
  if (!out.records) out.records = { cleared: false, bossArea: null };
}
// the conversions from older versions, in order (to = the version whose shape the function makes)
const MIGRATIONS: [to: number, migrate: (out: SaveData, raw: Record<string, any>) => void][] = [[1, migrateTo1]];
function loadSave(): SaveData {
  const { data: out, raw: s } = loadStore(ACTIVE_SAVE_KEY, defaultSave);
  if (!s) return out;
  // broken data fixed whatever the version (not part of the conversions below)
  const assist: unknown = out.settings.assist; // saves from before the setting had levels hold a boolean
  if (typeof assist === 'boolean') out.settings.assist = assist ? 'weak' : 'off';
  if (!Array.isArray(out.loadout))
    out.loadout = [basicW(s.weapon && out.unlocked[s.weapon] ? s.weapon : 'pistol'), null];
  if (!out.loadout[0]) out.loadout[0] = basicW('pistol');
  if (!Array.isArray(out.stash)) out.stash = [];
  const v = typeof s.v === 'number' ? s.v : 0;
  for (const [to, migrate] of MIGRATIONS) if (to > v) migrate(out, s);
  out.v = Math.max(v, SAVE_VERSION);
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
  saveStore(ACTIVE_SAVE_KEY, save);
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
  saveStore(ACTIVE_SAVE_KEY, obj);
  setSave(loadSave());
  return true;
}
