import type { SaveData, Snapshot, WeaponItem } from '../data/types.ts';
import { clamp } from '@engine/core/util.ts';
import { STASH_MAX } from '../data/progress.ts';
import { basicW, defaultSave, save } from './save.ts';
import { pickDrop, sellValue } from './rules.ts';
// The operations that change the save. Nothing outside src/core/ writes `save` (ESLint no-restricted-syntax);
// callers read it, call one of these, and persist() themselves.

// ---- bits ----
export const earnBits = (n: number) => {
  save.bits += n;
};
export const spendBits = (n: number) => {
  save.bits -= n;
};

// ---- weapons ----
// the weapon goes into a loadout slot; the weapon that was there goes to the stash unless it is a basic one
export function equipWeapon(slot: number, item: WeaponItem | null) {
  const prev = save.loadout[slot];
  if (prev && !prev.basic) save.stash.push(prev);
  save.loadout[slot] = item;
}
export const unlockWeapon = (id: string) => {
  save.unlocked[id] = true;
};
// the weapon leaves the stash (to be equipped)
export const takeFromStash = (i: number): WeaponItem => save.stash.splice(i, 1)[0];
export function sellFromStash(i: number) {
  save.bits += sellValue(save.stash[i]);
  save.stash.splice(i, 1);
}
export const setWeaponMod = (id: string, mod: { plus: number; r: number }) => {
  save.mods = Object.assign({}, save.mods, { [id]: mod });
};

// ---- base upgrades and reboot ----
// one more level of a base upgrade for `cost` bits
export function buyUpgrade(id: string, cost: number) {
  save.bits -= cost;
  save.up[id] = (save.up[id] || 0) + 1;
}
// one more level of a reboot bonus for `cost` points
export function buyRebootUpgrade(id: string, cost: number) {
  save.pres.pts -= cost;
  save.pres.up[id] = (save.pres.up[id] || 0) + 1;
}
// the reboot: `gain` points in, the base starts over (best, runs, boss kills and settings stay; the reboot bonuses
// give starting bits and relic weapons). Returns the reboot count
export function applyReboot(gain: number): number {
  const pr = save.pres,
    keep = { best: save.best, runs: save.runs, bossKills: save.bossKills, settings: save.settings };
  pr.pts += gain;
  pr.count++;
  const count = pr.count;
  Object.assign(save, defaultSave(), keep, { pres: pr });
  save.bits = pr.up.funds * 150;
  for (let k = 0; k < pr.up.relic; k++) save.stash.push({ id: pickDrop(), r: 2, basic: false });
  return count;
}

// ---- start depth ----
export const setStartTier = (n: number) => {
  save.startTier = n;
};
export const clampStartTier = () => {
  save.startTier = clamp(save.startTier, 0, save.shortcut);
};

// ---- runs ----
// non-basic weapons leave the base when a run starts: they come back only on extraction
export function riskLoadout() {
  save.loadout = save.loadout.map((w, i) => (w && w.basic ? w : i === 0 ? basicW('pistol') : null));
}
export const recordRunStart = () => {
  save.runs++;
};
// the deepest stage reached (0-based `stage`)
export const recordBest = (stage: number) => {
  save.best = Math.max(save.best, stage + 1);
};
// extraction: the equipped weapons are the next loadout, the bag goes to the stash (the cheapest is sold when it is
// full). Returns the bits from the weapons sold
export function storeWeapons(equipped: (WeaponItem | null)[], bag: WeaponItem[]): number {
  save.loadout = equipped;
  if (!save.loadout[0]) save.loadout[0] = basicW('pistol');
  let sold = 0;
  bag.forEach(w => save.stash.push(w));
  while (save.stash.length > STASH_MAX) {
    let mi = 0;
    save.stash.forEach((w, i) => {
      if (sellValue(w) < sellValue(save.stash[mi])) mi = i;
    });
    sold += sellValue(save.stash[mi]);
    save.stash.splice(mi, 1);
  }
  if (sold) save.bits += sold;
  return sold;
}
// dying closes the deepest shortcut (if any open) and the start depth follows. Returns whether one closed
export function closeShortcut(): boolean {
  const closed = save.shortcut > 0;
  if (closed) save.shortcut--;
  save.startTier = Math.min(save.startTier, save.shortcut);
  return closed;
}
// the checkpoint of a run in progress (null: none)
export const setSuspend = (snapshot: Snapshot | null) => {
  save.suspend = snapshot;
};

// ---- bosses ----
export const recordBossSeen = (kind: string) => {
  save.bossSeen[kind] = true;
};
export const recordBossKill = () => {
  save.bossKills++;
};
export const unlockReboot = () => {
  save.canReboot = true;
};
// the deepest shortcut opened since the last reboot
export const recordPeak = (tier: number) => {
  save.peak = Math.max(save.peak || 0, tier);
};
export const openShortcut = (tier: number) => {
  save.shortcut = tier;
};

// ---- settings ----
type Settings = SaveData['settings'];
export const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
  save.settings[key] = value;
};
export const toggleSetting = (key: 'autofire' | 'leftFire' | 'stickDash') => {
  save.settings[key] = !save.settings[key];
};
export const setLanguage = (code: string) => {
  save.settings.lang = code;
};
// the touch button placements, for the layout editor to change
export const layoutEdits = (): Settings['layout'] => save.settings.layout || (save.settings.layout = {});
// the PC key bindings the player changed (engine changedBindings form), after the key settings dialog changed them
export const setKeyBindings = (keys: Settings['keys']) => {
  save.settings.keys = keys;
};
export const resetLayout = () => {
  save.settings.layout = {};
};
