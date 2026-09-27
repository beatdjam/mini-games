import type { Perk } from './types.ts';
import { TUNE } from './progress.ts';
// Chips offered during a run
// Chips. v = normal amount, rv = amount on the rare (gold) version; chips without rv never come as rare.
// maxed(p) = true once the chip can't do anything more (it is then left out of the offer). cur(p) = the current value;
// the language file's curText(c) turns it into the line on the card. Names and descriptions are in js/lang/.
// Damage / fire rate / speed stack additively (two overload chips = +40%), so power grows in a straight line.
export const PERKS: Perk[] = [
  { id: 'overload', v: 0.2,  rv: 0.35, apply: (p, v) => { p.dmgMul += v; }, cur: p => p.dmgMul - 1 },
  { id: 'rapid',    v: 0.15, rv: 0.26, apply: (p, v) => { p.fireRate += v; }, cur: p => p.fireRate - 1 },
  { id: 'armor',    v: 20,   rv: 35,   apply: (p, v) => { p.maxHp += v; p.hp = Math.min(p.maxHp, p.hp + v); }, cur: p => p.maxHp },
  { id: 'repair',   v: 0.5,  rv: 0.85, apply: (p, v) => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * v); }, cur: p => [Math.ceil(p.hp), p.maxHp] },
  { id: 'leech',    v: 3,    rv: 5,    apply: (p, v) => { p.leech += v; }, cur: p => p.leech },
  { id: 'pierce',   v: 1,    rv: 2,    apply: (p, v) => { p.pierce = Math.min(3, p.pierce + v); }, maxed: p => p.pierce >= 3, cur: p => p.pierce },
  { id: 'split',    v: 1,              apply: p => { p.extra += 1; }, cur: p => p.extra },
  { id: 'light',    v: 0.12, rv: 0.21, apply: (p, v) => { p.spdMul += v; }, cur: p => p.spdMul - 1 },
  { id: 'crit',     v: 0.15, rv: 0.26, apply: (p, v) => { p.crit += v; }, maxed: p => p.crit >= TUNE.critCap, cur: p => p.crit },
  { id: 'sprint',   v: 0.35, rv: 0.6,  apply: (p, v) => { p.stRegen *= 1 + v; }, cur: p => Math.round(p.stRegen) },
  { id: 'chain',    v: 1,    rv: 2,    apply: (p, v) => { p.chain += v; }, cur: p => p.chain },
  { id: 'magnet',   v: 1,              apply: p => { p.magnet *= 1.8; p.gainMul *= 1.1; }, cur: p => p.magnet.toFixed(1) },
  { id: 'reload',   v: 0.25, rv: 0.44, apply: (p, v) => { p.reloadMul = Math.max(0.4, p.reloadMul - v); }, maxed: p => p.reloadMul <= 0.4, cur: p => 1 - p.reloadMul },
  { id: 'mag',      v: 0.4,  rv: 0.7,  apply: (p, v) => { p.magMul = Math.min(2.5, p.magMul + v); }, maxed: p => p.magMul >= 2.5, cur: p => p.magMul - 1 },
  { id: 'tank',     v: 30,   rv: 52,   apply: (p, v) => { p.stMax += v; p.st += v; }, cur: p => p.stMax },
];
