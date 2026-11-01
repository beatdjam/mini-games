import type { BossKind, SaveData, Snapshot, WeaponItem } from '../data/types.ts';
import { clamp } from '@engine/core/util.ts';
import { STASH_MAX, UPGRADES, milestoneBelow } from '../data/progress.ts';
import { basicW, save } from './save.ts';
import { bossAreaOn, bossAreaTierFor } from './bossArea.ts';
import { readiness, sellValue } from './rules.ts';
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

// ---- the level ----
// one more level bought with a dive's bits (at a milestone): its point put into upgrade `id`, the save's bits untouched
export function addLevelPoint(id: string) {
  save.up[id] = (save.up[id] || 0) + 1;
}
// one more level for `cost` bits, its point put into upgrade `id`
export function buyUpgrade(id: string, cost: number) {
  save.bits -= cost;
  save.up[id] = (save.up[id] || 0) + 1;
}
// ---- start depth ----
export const setStartTier = (n: number) => {
  save.startTier = n;
};
// Whether the last boss (TITAN) is down. Read only here: the TITAN draft adds the function that sets it
export const bossAreaCleared = (): boolean => save.records.cleared;
// The deepest start depth open: until TITAN is down it is the boss area's depth, so a save cannot start past the gate
// into the depths after it. With the boss area off, TITAN down, or the boss area not settled yet, the shortcut is the limit
export const startTierMax = (): number => {
  const area = save.records.bossArea;
  return !bossAreaOn() || bossAreaCleared() || !area ? save.shortcut : Math.min(save.shortcut, area.tier);
};
export const clampStartTier = () => {
  save.startTier = clamp(save.startTier, 0, startTierMax());
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
// dying sends the start back to the last milestone passed (data/progress.ts milestoneBelow) and the start depth follows.
// Returns whether it went back
export function fallBackToMilestone(): boolean {
  const to = milestoneBelow(save.shortcut),
    back = to < save.shortcut;
  save.shortcut = to;
  save.startTier = Math.min(save.startTier, save.shortcut);
  return back;
}
// the checkpoint of a run in progress (null: none)
export const setSuspend = (snapshot: Snapshot | null) => {
  save.suspend = snapshot;
};

// ---- bosses ----
export const recordBossSeen = (kind: BossKind) => {
  save.bossSeen[kind] = true;
};
export const recordBossKill = () => {
  save.bossKills++;
};
// the deepest shortcut opened
export const recordPeak = (tier: number) => {
  save.peak = Math.max(save.peak || 0, tier);
};
export const openShortcut = (tier: number) => {
  save.shortcut = tier;
};
// The boss area's beaten rooms stay in the save: a room beaten once is beaten after a death and after a resume from a
// checkpoint too. True when this was the first time (the caller gives the full rewards then)
export function recordBossRoomBeaten(kind: BossKind): boolean {
  const area = save.records.bossArea;
  if (!area) return false;
  if (area.beaten.includes(kind)) return false;
  area.beaten.push(kind);
  return true;
}
// The boss area's depth, settled once per save on the first dive from the base (when the flag is on). Returns whether
// this call settled it; the caller persists
export function settleBossArea(startTier: number): boolean {
  if (!bossAreaOn() || save.records.bossArea) return false;
  save.records.bossArea = { tier: bossAreaTierFor(save.shortcut, startTier), beaten: [] };
  return true;
}
// the save a boss area sim starts from: at the boss area's depth, with none of its rooms beaten
export function devBossAreaStart(tier: number) {
  save.shortcut = Math.max(save.shortcut, tier);
  save.startTier = tier;
  save.records.bossArea = { tier, beaten: [] };
}
// Equipment for a depth, for a save made to try it: two basic weapons (they grow with the depth: rules.ts basicNow) and
// the levels of a player who has come that far: every level with a limit at its limit, the rest shared between output
// and armour, and more of those in turn if the base's own yardstick does not yet call that depth a fair fight.
// data/progress.ts levelCost: a dive's bits grow 1.6 times a depth and a level costs 1.2 times the last, so about 2.6
// levels a depth on top of the 36 of DEPTH 20. An estimate from those figures, not measured at this depth
const DEV_GEAR_LEVELS_AT_20 = 36;
const DEV_GEAR_LEVELS_PER_DEPTH = 2.6;
const DEV_GEAR_FAIR = 2; // rules.ts readiness: 2 is 'fair'
const DEV_GEAR_MAX_LEVELS = 200;
export function devBossAreaGear(tier: number) {
  save.loadout = [basicW('shotgun'), basicW('smg')];
  let left = Math.round(DEV_GEAR_LEVELS_AT_20 + (tier + 1 - 20) * DEV_GEAR_LEVELS_PER_DEPTH);
  for (const u of UPGRADES)
    if (Number.isFinite(u.max)) {
      save.up[u.id] = u.max;
      left -= u.max;
    }
  save.up.dmg = Math.ceil(left / 2);
  save.up.hp = Math.floor(left / 2);
  for (let n = 0; n < DEV_GEAR_MAX_LEVELS && readiness(tier) > DEV_GEAR_FAIR; n++) {
    const id = n % 2 ? 'hp' : 'dmg';
    save.up[id] = (save.up[id] || 0) + 1;
  }
}

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
