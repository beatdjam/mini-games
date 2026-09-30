import type { WeaponItem } from '../data/types.ts';
import { LANG } from '../../../../engine/core/i18n.ts';
import { DROP_POOL, PLUS_DMG, RARITY, WEAPONS } from '../data/weapons.ts';
import { PER, TUNE, enemyGrowth } from '../data/progress.ts';
import { PERKS } from '../data/perks.ts';
import { save } from './save.ts';
// Formulas that read the data: progress, drops, modding, sell value
// progress in "old" 5-stage-per-depth units, so per-depth scaling stays the same whatever PER is
// (depth start = depth * 5, the boss = depth * 5 + 4)
export const prog = (s: number): number => Math.floor(s / PER) * 5 + (s % PER) * 4 / (PER - 1);
// enemies get 15% stronger per reboot, up to PRES_DIFF_CAP reboots: the bonuses run out after a few reboots,
// so without a cap a long prestige run would leave DEPTH 1 out of reach right after a reboot
export const PRES_DIFF_CAP = 7;
export const presMulOf = (count: number): number => 1 + Math.min(count, PRES_DIFF_CAP) * 0.15;
export const presMul = (): number => presMulOf(save.pres.count);
// every weapon type can drop during a dive; unlocking only decides what you can start with and mod at the base
export const pickDrop = () => DROP_POOL[Math.floor(Math.random() * DROP_POOL.length)];
export const modOf = (id: string): { plus: number; r: number } => (save.mods && save.mods[id]) || { plus: 0, r: 0 };
// a basic weapon as it currently stands after modding (non-basic weapons pass through)
export const basicNow = <W extends WeaponItem | null>(w: W): W => w && w.basic ? Object.assign({}, w, { plus: modOf(w.id).plus, r: modOf(w.id).r }) : w;
// sustained damage per second of a weapon before any chips: the same sum as weaponStats (js/actors/player.ts)
// with every chip-driven value at its start, so it works on the base screen where there is no player
export function bareDps(w: WeaponItem): number {
  const def = WEAPONS[w.id]!, opt = (k: string) => (w.opts || []).filter(o => o === k).length;
  const mag = Math.max(1, Math.round(def.mag * (1 + 0.3 * opt('mag'))));
  const interval = def.rate * Math.pow(0.91, opt('rate')), reload = def.reload * Math.pow(0.8, opt('reload'));
  const crit = Math.min(TUNE.critCap, 0.08 * opt('crit'));
  return def.dmg * RARITY[w.r]!.mult * (1 + PLUS_DMG * (w.plus || 0)) * def.pellets * mag / (mag * interval + reload) * (1 + crit);
}
// How ready the current loadout and base upgrades are for starting at a depth (shown on the start-depth buttons).
// offence: the best loadout weapon x the damage upgrade x the supply chips that start gives (about +10% each),
// over how much enemy health has grown by then; defence: max HP over how much enemy damage has grown.
// score = the geometric mean of the two, where 1 = DEPTH 1 with a plain handgun and no upgrades.
// Returns 0 (easy) .. 4 (reckless) by READY_CUTS.
export const READY_CUTS = [1.5, 1.15, 0.85, 0.6];
// what the readiness is computed from: the loadout weapons, the damage upgrade level, max HP and the reboot multiplier
export interface ReadyState { weapons: WeaponItem[]; dmgUp: number; hp: number; pres: number }
export const readyNow = (): ReadyState => ({
  weapons: save.loadout.map(basicNow).filter((w): w is WeaponItem => !!w), dmgUp: save.up.dmg,
  hp: TUNE.hp + save.up.hp * 15 + save.pres.up.hp * 10, pres: presMul(),
});
// right after the next reboot: a plain handgun, no base upgrades, the kept reboot bonuses, one more reboot
export const readyAfterReboot = (): ReadyState => ({
  weapons: [{ id: 'pistol', r: 0, basic: true }], dmgUp: 0, hp: TUNE.hp + save.pres.up.hp * 10, pres: presMulOf(save.pres.count + 1),
});
export function readinessScore(tier: number, s: ReadyState = readyNow()): number {
  const ref = bareDps({ id: 'pistol', r: 0, basic: true });
  const best = Math.max(0, ...s.weapons.map(bareDps));
  const off = best / ref * (1 + s.dmgUp * 0.08) * Math.pow(1.1, tier) / (enemyGrowth(tier) * s.pres);
  const def = s.hp / TUNE.hp / ((1 + 0.045 * 5 * tier) * s.pres);
  return Math.sqrt(off * def);
}
export function readiness(tier: number, s?: ReadyState): number {
  const v = readinessScore(tier, s), k = READY_CUTS.findIndex(c => v >= c);
  return k < 0 ? READY_CUTS.length : k;
}
export const sellValue = (w: WeaponItem): number => Math.round(8 + WEAPONS[w.id].cost * 0.06 + [0, 20, 55][w.r] + (w.plus || 0) * 10 + (w.opts || []).length * 20);
// run.perks from before chips had ids held Japanese names; turn those into ids
export const perkIdOf = (rec: string): string => {
  const base = rec.replace(/\+$/, ''), plus = rec.endsWith('+') ? '+' : '';
  if (PERKS.some(o => o.id === base)) return rec;
  const id = Object.keys(LANG.ja.data.perks).find(k => LANG.ja.data.perks[k].name === base);
  return id ? id + plus : rec;
};
// a chip as recorded in run.perks: its id, with '+' for the rare version
export const perkName = (rec: string): string => { const o = PERKS.find(x => x.id === rec.replace(/\+$/, '')); return o ? o.name + (rec.endsWith('+') ? '+' : '') : rec; };
