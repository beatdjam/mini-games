import type { WeaponItem } from '../data/types.ts';
import { LANG } from '../../../../engine/core/i18n.ts';
import { DROP_POOL, WEAPONS } from '../data/weapons.ts';
import { PER } from '../data/progress.ts';
import { PERKS } from '../data/perks.ts';
import { save } from './save.ts';
// Formulas that read the data: progress, drops, modding, sell value
// progress in "old" 5-stage-per-depth units, so per-depth scaling stays the same whatever PER is
// (depth start = depth * 5, the boss = depth * 5 + 4)
export const prog = (s: number): number => Math.floor(s / PER) * 5 + (s % PER) * 4 / (PER - 1);
export const presMul = () => 1 + save.pres.count * 0.15;
// every weapon type can drop during a dive; unlocking only decides what you can start with and mod at the base
export const pickDrop = () => DROP_POOL[Math.floor(Math.random() * DROP_POOL.length)];
export const modOf = (id: string): { plus: number; r: number } => (save.mods && save.mods[id]) || { plus: 0, r: 0 };
// a basic weapon as it currently stands after modding (non-basic weapons pass through)
export const basicNow = <W extends WeaponItem | null>(w: W): W => w && w.basic ? Object.assign({}, w, { plus: modOf(w.id).plus, r: modOf(w.id).r }) : w;
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
