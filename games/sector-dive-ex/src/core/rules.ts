import type { BossKind, RestrictionId, RunEnd, WeaponItem } from '../data/types.ts';
import { BOSS_ORDER } from '../data/bosses.ts';
import { LANG, t } from '@engine/core/i18n.ts';
import {
  CRIT_OPT_PER_LEVEL,
  DROP_POOL,
  MAG_OPT_PER_LEVEL,
  PLUS_DMG,
  PLUS_FROM_STAGE,
  PLUS_PER_STAGE,
  PLUS_STAGE_OFFSET,
  RARITY,
  RATE_OPT_MUL,
  RELOAD_OPT_MUL,
  SELL_DEPTH_SHARE,
  SUPPLY_PLUS_BELOW,
  SUPPLY_RARITY_AT,
  WEAPONS,
} from '../data/weapons.ts';
import {
  BOSS_AREA_START_TIER,
  DEPTH_SCALE,
  DMG_SCALE_PER_PROG,
  HP_PER_POINT,
  LEVEL_DMG_MUL,
  LOOP_TUNE,
  PER,
  TUNE,
  enemyGrowth,
  hpGrowth,
  levelCost,
  restrictionOf,
} from '../data/progress.ts';
import { BOSS_TUNE } from '../data/bosses.ts';
import { PERKS } from '../data/perks.ts';
import { isArcade, modeTune, save } from './save.ts';
// Formulas that read the data: progress, drops, modding, sell value
// progress in "old" 5-stage-per-depth units, so per-depth scaling stays the same whatever PER is
// (depth start = depth * 5 * DEPTH_SCALE, the boss = depth * 5 * DEPTH_SCALE + 4)
// (ARCADE counts its depths deeper: modeTune().depthScale)
export const depthScale = (): number => modeTune().depthScale;
// ENDLESS: the loop whose strength the depths use: the challenge's chosen strength while one is played, else the loop
// being played
export const strengthLoop = (): number => (save.challenge ? save.challenge.strength : save.loop);
// What depth `tier` (0-based) counts as in the curves of the enemies, drops and bits. ARCADE is what it was; ENDLESS's
// loop 1 counts depthScale() a depth up to the boss area's depth, and its later loops start and end deeper (LOOP_TUNE
// in data/progress.ts). Past the boss area's depth every loop grows by LOOP_TUNE.pastEnd of depthScale() a depth: at
// the full rate D26 (two depths past D24's rooms) was a wall the user could not get through (2026-11-07). A challenge
// uses the strength chosen for it
export function scaledDepth(tier: number): number {
  if (isArcade()) return tier * depthScale();
  const loop = Math.min(strengthLoop(), LOOP_TUNE.cap),
    start = loop <= 1 ? 0 : LOOP_TUNE.start + LOOP_TUNE.shift * (loop - 2),
    end = loop <= 1 ? BOSS_AREA_START_TIER * depthScale() : LOOP_TUNE.end + LOOP_TUNE.shift * (loop - 2);
  return tier <= BOSS_AREA_START_TIER
    ? start + ((end - start) * tier) / BOSS_AREA_START_TIER
    : end + (tier - BOSS_AREA_START_TIER) * depthScale() * LOOP_TUNE.pastEnd;
}
// The shortcut supply picks a dive from `tier` gets: the depths of loop 1 that hold the same strength (scaledDepth over
// depthScale()), so that a later loop's DEPTH 1 sets out with the chips its enemies call for (it had none: the user
// could not down one enemy, 2026-11-07). Loop 1 up to the boss area is one a skipped depth, as it was
export const supplyPicks = (tier: number): number => (isArcade() ? tier : Math.round(scaledDepth(tier) / depthScale()));
export const progressOf = (s: number): number => scaledDepth(Math.floor(s / PER)) * 5 + ((s % PER) * 4) / (PER - 1);
// every weapon type can drop during a dive; unlocking only decides what you can start with and mod at the base
// the player's level: one for every point put into the base upgrades (save.up), whichever it went to
export const levelOf = (): number => Object.values(save.up).reduce((n, v) => n + (v || 0), 0);
// what the next level costs (bits): the same whatever it goes to (data/progress.ts levelCost)
export const nextLevelCost = (): number => levelCost(levelOf());
// ENDLESS: the loops cleared so far (their rows with no restriction, TITAN beaten, up to LOOP_TUNE.cap). Each adds
// LOOP_TUNE.bonus to the start's HP and damage multiplier; ARCADE has no loops
export const loopsCleared = (): number =>
  isArcade()
    ? 0
    : save.records.endless.filter(r => r.restriction === 'none' && r.titan && r.loop <= LOOP_TUNE.cap).length;
const loopBonus = (): number => 1 + LOOP_TUNE.bonus * loopsCleared();
// ENDLESS: what the restriction clears have added to the start: each (restriction, strength) row with TITAN down adds
// that restriction's value times its strength, up to LOOP_TUNE.cap. `id` asks for one restriction's share, none for all
export interface RestrictionBonus {
  dmg: number;
  hp: number;
  bits: number;
}
export function restrictionBonus(id?: RestrictionId): RestrictionBonus {
  const total: RestrictionBonus = { dmg: 0, hp: 0, bits: 0 };
  if (isArcade()) return total;
  for (const row of save.records.endless) {
    if (row.restriction === 'none' || !row.titan || row.loop > LOOP_TUNE.cap) continue;
    if (id && row.restriction !== id) continue;
    const def = restrictionOf(row.restriction);
    if (!def) continue;
    total.dmg += (def.dmg ?? 0) * row.loop;
    total.hp += (def.hp ?? 0) * row.loop;
    total.bits += (def.bits ?? 0) * row.loop;
  }
  return total;
}
// the loops' bonus and the restrictions' bonus add up (not multiply): 1 + the loops + the restriction clears
const startBonus = (kind: 'dmg' | 'hp'): number => loopBonus() + restrictionBonus()[kind];
// max HP and damage multiplier at the start of a dive, from the points in armour and output (given), times the loops
// cleared and the restriction clears (ENDLESS; 1 in ARCADE). The HP is rounded after the bonus
export const startMaxHp = (upHp: number): number => Math.round((TUNE.hp + upHp * HP_PER_POINT) * startBonus('hp'));
export const startDmgMul = (upDmg: number): number => Math.pow(LEVEL_DMG_MUL, upDmg) * startBonus('dmg');
// (dev: with setDropOnly every drop is that one weapon, for the trials that look at one weapon at a time,
// sim/bot.sim.ts; the die is thrown all the same, so the rest of the run's dice do not shift)
let dropOnly: string | null = null;
export function setDropOnly(id: string | null) {
  dropOnly = id;
}
export const pickDrop = () => {
  const id = DROP_POOL[Math.floor(Math.random() * DROP_POOL.length)];
  return dropOnly ?? id;
};
// the + value a base weapon is handed out with for a dive starting at `stage` (progress): the level of the weapons
// dropped there, less SUPPLY_PLUS_BELOW (about what they average)
export const supplyPlus = (stage: number): number =>
  stage >= PLUS_FROM_STAGE
    ? Math.max(0, Math.floor((stage - PLUS_STAGE_OFFSET) * PLUS_PER_STAGE) - SUPPLY_PLUS_BELOW)
    : 0;
// the rarity a base weapon is handed out with for a dive from `tier` (0-based start depth, in scaled depths)
export const supplyRarity = (tier: number): number => SUPPLY_RARITY_AT.filter(at => scaledDepth(tier) >= at).length;
// a base weapon as it is handed out for a dive from `tier` (0-based start depth): the + value (supplyPlus) and rarity
// (supplyRarity) of that depth. A found weapon as it is
export const basicNow = <W extends WeaponItem | null>(w: W, tier = 0): W =>
  w && w.basic ? Object.assign({}, w, { plus: supplyPlus(progressOf(tier * PER)), r: supplyRarity(tier) }) : w;
// sustained damage per second of a weapon before any chips: the same sum as weaponStats (src/actors/weapons.ts)
// with every chip-driven value at its start, so it works on the base screen where there is no player
function bareDps(w: WeaponItem): number {
  const def = WEAPONS[w.id]!,
    opt = (k: string) => (w.opts || []).filter(o => o === k).length;
  const mag = Math.max(1, Math.round(def.mag * (1 + MAG_OPT_PER_LEVEL * opt('mag'))));
  const interval = def.rate * Math.pow(RATE_OPT_MUL, opt('rate')),
    reload = def.reload * Math.pow(RELOAD_OPT_MUL, opt('reload'));
  const crit = Math.min(TUNE.critCap, CRIT_OPT_PER_LEVEL * opt('crit'));
  return (
    ((def.dmg * RARITY[w.r]!.mult * (1 + PLUS_DMG * (w.plus || 0)) * def.pellets * mag) / (mag * interval + reload)) *
    (1 + crit)
  );
}
// How ready the current loadout and base upgrades are for starting at a depth (shown on the start-depth buttons).
// offence: the best loadout weapon x the damage upgrade x the shortcut supply picks (supplyGain),
// over how much enemy health has grown by then, and three quarters of the way (^READY_BOSS_WEIGHT) over how much more the depth's boss has
// grown than the rooms: a deep start's first wall is that boss; defence: max HP over how much enemy damage has grown.
// score = the geometric mean of the two, where 1 = DEPTH 1 with a plain handgun and no upgrades.
// Returns 0 (easy) .. 4 (reckless) by READY_CUTS.
const READY_CUTS = [1.5, 1.15, 0.85, 0.6];
// the yardstick of the offence: the damage per second of a plain handgun as it was when READY_CUTS were set (16 a
// round). Fixed, so a stronger handgun reads as a better start instead of moving the yardstick with it
const READY_REF_DPS = 45.5;
const READY_BOSS_WEIGHT = 0.75;
// what the readiness is computed from: the loadout weapons, the damage upgrade level and max HP
interface ReadyState {
  weapons: WeaponItem[];
  dmg: number;
  hp: number;
} // dmg: the damage multiplier (startDmgMul)
const readyNow = (tier: number): ReadyState => ({
  weapons: save.loadout.map(w => basicNow(w, tier)).filter((w): w is WeaponItem => !!w),
  dmg: startDmgMul(save.up.dmg),
  hp: startMaxHp(save.up.hp),
});
// what `picks` shortcut supply picks multiply the offence by (the curve was fitted to picks worth 5 chips each: more
// a pick counts as that many more picks, and each pick covers DEPTH_SCALE depths)
const supplyGain = (picks: number): number =>
  picks > 0
    ? Math.exp(
        TUNE.supplyCurve[0]! *
          Math.pow((picks * TUNE.supplyTimes * DEPTH_SCALE) / SUPPLY_CURVE_TIMES, TUNE.supplyCurve[1]!),
      )
    : 1;
const SUPPLY_CURVE_TIMES = 5;
export function readinessScore(tier: number, s: ReadyState = readyNow(tier)): number {
  // the curves below are per depth of DEPTH_SCALE depths: a start at `tier` is that many depths in
  const d = scaledDepth(tier);
  const best = Math.max(0, ...s.weapons.map(bareDps));
  const bossWall = Math.pow(hpGrowth(d, BOSS_TUNE.growth, BOSS_TUNE.lateGrowth) / enemyGrowth(d), READY_BOSS_WEIGHT);
  const off = ((best / READY_REF_DPS) * s.dmg * supplyGain(supplyPicks(tier))) / (enemyGrowth(d) * bossWall);
  const def = s.hp / TUNE.hp / (1 + DMG_SCALE_PER_PROG * 5 * d);
  return Math.sqrt(off * def);
}
export function readiness(tier: number, s?: ReadyState): number {
  const v = readinessScore(tier, s),
    k = READY_CUTS.findIndex(c => v >= c);
  return k < 0 ? READY_CUTS.length : k;
}
// About the bits one depth gives at `progress`: its boss's bits (bossDifficulty in actors/bosses/common.ts, which the
// boss drops in part and its depth's enemies in the rest) as picked up (the mode's bitScale)
const depthBitsAt = (progress: number): number =>
  BOSS_TUNE.bits *
  1.33 *
  BOSS_TUNE.hpMul *
  hpGrowth((progress - 4) / 5, BOSS_TUNE.growth, BOSS_TUNE.lateGrowth) *
  modeTune().bitScale;
// What a weapon sells for: the flat price of its kind, rarity, + value and options, or SELL_DEPTH_SHARE of a depth's
// bits where its + value drops (the + read back to progress, as supplyPlus counts it), whichever is more
export const sellValue = (w: WeaponItem): number => {
  const flat = 8 + WEAPONS[w.id].cost * 0.06 + [0, 20, 55][w.r] + (w.plus || 0) * 10 + (w.opts || []).length * 20;
  const at = w.plus ? w.plus / PLUS_PER_STAGE + PLUS_STAGE_OFFSET : 0;
  return Math.round(Math.max(flat, at ? SELL_DEPTH_SHARE * depthBitsAt(at) : 0));
};
// a chip as recorded in run.perks: its id, with a trailing '+' for the rare version ("split", "split+")
const RARE_MARK = '+';
export const perkRecord = (id: string, rare: boolean): string => (rare ? id + RARE_MARK : id);
export const parsePerk = (rec: string): { id: string; rare: boolean } => {
  const rare = rec.endsWith(RARE_MARK);
  return { id: rare ? rec.slice(0, -RARE_MARK.length) : rec, rare };
};
// run.perks from before chips had ids held Japanese names; turn those into ids
export const perkIdOf = (rec: string): string => {
  const { id: base, rare } = parsePerk(rec);
  if (PERKS.some(o => o.id === base)) return rec;
  const id = Object.keys(LANG.ja.data.perks).find(k => LANG.ja.data.perks[k].name === base);
  return id ? perkRecord(id, rare) : rec;
};
// how many times each key comes up among the items, keys in the order first seen (a Map keeps insertion order)
export const countBy = <T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, number> => {
  const counts = new Map<K, number>();
  items.forEach(item => {
    const k = keyOf(item);
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  return counts;
};
// the chips of a run, most taken first (ties in the order first taken), the rare versions counted with the normal
// ones: "Split ×25, Rapid ×18, Overload ×16 (3 rare)"; a chip taken once keeps its own name ("Overload+")
export function chipSummary(perks: string[]): string {
  const recs = perks.map(parsePerk);
  const taken = countBy(recs, p => p.id),
    rare = countBy(
      recs.filter(p => p.rare),
      p => p.id,
    );
  return [...taken]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => {
      const r = rare.get(id) ?? 0;
      return n === 1
        ? perkName(perkRecord(id, r > 0))
        : t(r ? 'common.countRare' : 'common.count', { name: perkName(id), n, r });
    })
    .join(t('common.sep'));
}
export const perkName = (rec: string): string => {
  const { id, rare } = parsePerk(rec);
  const o = PERKS.find(x => x.id === id);
  return o ? o.name + (rare ? '+' : '') : rec;
};
// how each way a dive can end is shown: the result screen's eyebrow (lowercase) and title, and the share card's
// badge (fixed English capitals: the card is drawn with the same Latin font in both languages, so it does not go
// through i18n and is not the title uppercased: ja's title is 帰還完了). title is a function so the language is read when shown
export const RUN_END: Record<RunEnd, { eyebrow: string; title: () => string; badge: string }> = {
  extract: { eyebrow: 'extracted', title: () => t('res.extract'), badge: 'EXTRACTED' },
  abandon: { eyebrow: 'abandoned', title: () => t('res.abandon'), badge: 'ABANDONED' },
  dead: { eyebrow: 'signal lost', title: () => t('res.dead'), badge: 'SIGNAL LOST' },
  clear: { eyebrow: 'cleared', title: () => t('res.clear'), badge: 'CLEARED' },
};
// is a name from outside the code (a dev entry's hash, a button's data attribute, a trailer script) one of the bosses
export const isBossKind = (k: string | undefined): k is BossKind => (BOSS_ORDER as (string | undefined)[]).includes(k);
