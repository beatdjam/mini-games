import type {
  BossKind,
  ContinueFrom,
  EndlessRecord,
  RestrictionId,
  SaveData,
  Snapshot,
  WeaponItem,
} from '../data/types.ts';
import { clamp } from '@engine/core/util.ts';
import { LOOP_TUNE, STASH_MAX, milestoneBelow, restrictionOf } from '../data/progress.ts';
import { BOSS_ROOM_ORDER } from '../data/bossRooms.ts';
import { basicW, defaultSave, isArcade, modeTune, newEndlessRecord, save } from './save.ts';
import { bossAreaOn, bossAreaTierFor } from './bossArea.ts';
import { sellValue } from './rules.ts';
// The operations that change the save. Nothing outside src/core/ writes `save` (ESLint no-restricted-syntax);
// callers read it, call one of these, and persist() themselves.
// (loopsCleared reads the ENDLESS rows for the start's bonus and is used by the formulas in core/rules.ts, which this
// module already imports from: it lives there and is offered from here as well)
export { loopsCleared } from './rules.ts';

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
// ARCADE: a weapon found in a dive unlocks its kind (ENDLESS buys it with bits at the base). Returns whether this is
// the first time (the caller shows the toast then)
export function unlockFoundWeapon(id: string): boolean {
  if (save.unlocked[id]) return false;
  unlockWeapon(id);
  return true;
}
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
// Whether the last boss (TITAN) is down (recordTitanClear sets it)
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
// ---- ENDLESS records ----
// The row the dives of now go into: the loop being played with no restriction, or the challenge's strength and
// restriction. The writers below and the base's records page ask it for the row
const RESTRICTION = 'none';
export function currentEndlessRecord(): EndlessRecord {
  const loop = save.challenge ? save.challenge.strength : save.loop,
    restriction = save.challenge ? save.challenge.restriction : RESTRICTION,
    rows = save.records.endless,
    found = rows.find(r => r.loop === loop && r.restriction === restriction);
  if (found) return found;
  const made = newEndlessRecord(false, 0, loop, restriction);
  rows.push(made);
  return made;
}
// a dive that ended adds its time and kills to the row, and its best to the row's best. `dead` only for a death (a
// give-up counts as a dive, not a death)
export function recordEndlessRun(stage: number, sec: number, kills: number, dead: boolean) {
  const row = currentEndlessRecord();
  row.best = Math.max(row.best, stage + 1);
  row.sec += sec;
  row.kills += kills;
  row.dives++;
  if (dead) row.deaths++;
}
// TITAN's first clear in this row: the row's dives so far plus this dive's clock up to now. Never overwritten; a partial
// row keeps no time. The row is cleared (titan) even when it is partial
export function recordEndlessTitan(sec: number) {
  const row = currentEndlessRecord();
  row.titan = true;
  if (row.titanSec === null && !row.partial) row.titanSec = row.sec + sec;
}
// whether the loop being played is cleared: its row with no restriction has beaten TITAN
export const loopCleared = (): boolean =>
  save.records.endless.some(r => r.loop === save.loop && r.restriction === RESTRICTION && r.titan);
// ENDLESS: on to the next loop. The start depths, the boss area and a suspended dive go back to a new save's (as
// resetArcadeProgress does); the level, weapons, bits, records and settings stay
export function startNextLoop() {
  const base = defaultSave();
  save.loop += 1;
  save.shortcut = base.shortcut;
  save.startTier = base.startTier;
  save.records.bossArea = base.records.bossArea;
  save.suspend = base.suspend;
}
// ---- ENDLESS restriction challenges ----
// the strongest loop a challenge can be played at: the deepest plain loop cleared, up to LOOP_TUNE.cap (0: none cleared)
export function challengeStrengthMax(): number {
  const cleared = save.records.endless
    .filter(r => r.restriction === RESTRICTION && r.titan)
    .reduce((n, r) => Math.max(n, r.loop), 0);
  return Math.min(cleared, LOOP_TUNE.cap);
}
// ENDLESS only, out of a challenge, with no dive suspended and at least one loop cleared
export const canStartChallenge = (): boolean =>
  !isArcade() && !save.challenge && save.suspend === null && challengeStrengthMax() >= 1;
// whether the challenge being played carries restriction `id`
export const usingRestriction = (id: RestrictionId): boolean => save.challenge?.restriction === id;
// Sets the main loop's start depth, boss area and suspended dive aside and begins a challenge at D1. Only a ready
// restriction and a strength within the cleared loops are taken
export function startChallenge(restriction: RestrictionId, strength: number): boolean {
  if (!canStartChallenge() || !Number.isInteger(strength)) return false;
  if (strength < 1 || strength > challengeStrengthMax()) return false;
  if (!restrictionOf(restriction)?.ready) return false;
  save.challenge = {
    restriction,
    strength,
    main: {
      shortcut: save.shortcut,
      startTier: save.startTier,
      bossArea: save.records.bossArea,
      suspend: save.suspend,
    },
  };
  const base = defaultSave();
  save.shortcut = base.shortcut;
  save.startTier = base.startTier;
  save.records.bossArea = base.records.bossArea;
  save.suspend = base.suspend;
  return true;
}
// Ends the challenge: the main loop's start depth, boss area and suspended dive come back. A suspended dive stops it
export function endChallenge(): boolean {
  const challenge = save.challenge;
  if (!challenge || save.suspend !== null) return false;
  save.shortcut = challenge.main.shortcut;
  save.startTier = challenge.main.startTier;
  save.records.bossArea = challenge.main.bossArea;
  save.suspend = challenge.main.suspend;
  save.challenge = null;
  return true;
}
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
// ARCADE: where the result screen's CONTINUE goes back to (null: none)
export const setContinueFrom = (from: ContinueFrom | null) => {
  save.continueFrom = from;
};
// ARCADE: put the save's part of a CONTINUE back to the stage's head (the checkpoint keeps the run and the player)
export function restoreContinue(from: ContinueFrom) {
  save.bits = from.bits;
  save.up = from.up;
  save.loadout = from.loadout;
  save.stash = from.stash;
  save.shortcut = from.shortcut;
  save.startTier = from.startTier;
  save.peak = from.peak;
  save.records.bossArea = from.bossArea;
}

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
// The eight rooms are one of each kind, so all eight kinds in the save open the gate to TITAN. False until the boss area
// is settled (or while no room is beaten yet)
export function allBossRoomsBeaten(): boolean {
  const area = save.records.bossArea;
  return !!area && BOSS_ROOM_ORDER.every(kind => area.beaten.includes(kind));
}
// TITAN is down: the save keeps the clear (the caller persists)
export function recordTitanClear() {
  save.records.cleared = true;
}
// ARCADE: a clear's time in seconds, with the CONTINUEs it used (none: a clean clear). Returns whether it is the fastest
// so far in its own kind (the caller persists)
export function recordBestTime(sec: number, continues = 0): boolean {
  if (continues > 0) {
    const best = save.records.bestTimeContinued;
    if (best !== null && best <= sec) return false;
    save.records.bestTimeContinued = sec;
    save.records.bestTimeContinuedCount = continues;
    return true;
  }
  const best = save.records.bestTime;
  if (best !== null && best <= sec) return false;
  save.records.bestTime = sec;
  return true;
}
// The boss area's depth, settled once per save on the first dive from the base or resume (when the flag is on). Returns
// whether this call settled it; the caller persists
export function settleBossArea(startTier: number): boolean {
  if (!bossAreaOn() || save.records.bossArea) return false;
  save.records.bossArea = { tier: bossAreaTierFor(save.shortcut, startTier), beaten: [] };
  return true;
}
// ARCADE: the boss area is the depth after the last sector (modeTune().sectorsBeforeBossArea), and its rooms are
// unbeaten when a dive sets out. Returns whether this call settled it; the caller persists
export function settleArcadeBossArea(): boolean {
  const tier = modeTune().sectorsBeforeBossArea;
  if (tier === null || !bossAreaOn() || save.records.bossArea?.tier === tier) return false;
  save.records.bossArea = { tier, beaten: [] };
  return true;
}
// ARCADE: what a dive leaves behind is dropped when it ends (cleared, lost or given up) and before the next one sets out.
// The records and what the base keeps (the unlocks, the bosses met and killed, the runs, the best and the settings) stay
export function resetArcadeProgress() {
  const base = defaultSave();
  save.bits = base.bits;
  save.up = base.up;
  save.loadout = base.loadout;
  save.stash = base.stash;
  save.shortcut = base.shortcut;
  save.startTier = base.startTier;
  save.peak = base.peak;
  save.records.bossArea = null;
  save.suspend = null;
}
// the save a boss area sim starts from: at the boss area's depth, with none of its rooms beaten
export function devBossAreaStart(tier: number) {
  save.shortcut = Math.max(save.shortcut, tier);
  save.startTier = tier;
  save.records.bossArea = { tier, beaten: [] };
}
// The base levels of a real save at DEPTH 24 (2026-11-01), for a save made to try the boss area: what is on the player
// in a dive is set by dev/views/bossRush.ts
const DEV_GEAR_LEVELS = { hp: 5, dmg: 57, spd: 0, dash: 1, stam: 0, gain: 5, kit: 2, chip: 2, choice: 1 };
export function devBossAreaGear() {
  save.loadout = [basicW('shotgun'), basicW('smg')];
  Object.assign(save.up, DEV_GEAR_LEVELS);
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
