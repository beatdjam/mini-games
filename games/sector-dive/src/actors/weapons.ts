import type { Weapon, WeaponDef, WeaponItem } from '../data/types.ts';
import { randi, shuffle } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import {
  AFFIX,
  CRIT_OPT_PER_LEVEL,
  MAG_OPT_PER_LEVEL,
  PLUS_DMG,
  RARITY,
  RATE_OPT_MUL,
  RELOAD_OPT_MUL,
  SPLIT_DMG_PER_CHIP,
  WEAPONS,
} from '../data/weapons.ts';
import { TUNE } from '../data/progress.ts';
import { pickDrop } from '../core/rules.ts';
import { player } from './player.ts';

// ---- tuning numbers used only here ----
// weapon drops
const RARITY_STAGE_BONUS = 0.025; // rarity roll bonus per stage (deeper drops lean rarer)
const RARITY_BONUS_MAX = 0.6; // ... up to this
const RARITY_3_AT = 1.05; // roll above this gives rarity 2 (3 stars)
const RARITY_2_AT = 0.68; // roll above this gives rarity 1 (2 stars)
const PLUS_FROM_STAGE = 2.5; // weapons start getting a + value from this stage
const PLUS_STAGE_OFFSET = 2; // stages before the + level starts climbing
const PLUS_PER_STAGE = 0.6; // + level climbs this much per stage
const PLUS_OVER_CHANCE = 0.15; // chance of a + above that level
const PLUS_OVER_MORE = 0.3; // chance of each further step above it
const PLUS_BELOW_MAX = 2; // otherwise up to this many below it
const AFFIX1_FROM_STAGE = 5,
  AFFIX1_BASE = 0.35,
  AFFIX1_PER_STAGE = 0.04; // first option: from this stage, chance, chance per stage after
const AFFIX2_FROM_STAGE = 10,
  AFFIX2_BASE = 0.3,
  AFFIX2_PER_STAGE = 0.03; // second option: the same
// weapon option and chip effects
const PIERCE_BLAST_PER_LEVEL = 0.15; // rocket blast radius per pierce level
export const CRIT_MUL = 2; // crit damage multiplier
export const newWeapon = (id: string, r: number, basic?: boolean, plus?: number, opts?: string[]): Weapon => ({
  id,
  r,
  basic: !!basic,
  plus: plus || 0,
  opts: opts || [],
  mag: WEAPONS[id].mag,
});
// how many of option k a weapon has (the one in hand if none given)
export const weaponOptCount = (k: string, w?: WeaponItem | null): number => {
  const item = w || (player && player.weapons[player.cur]);
  return item && item.opts ? item.opts.filter(o => o === k).length : 0;
};
export const wDmgMul = (w: WeaponItem): number => RARITY[w.r].mult * (1 + PLUS_DMG * (w.plus || 0));
// `stage` here is progress (progressOf), not the raw stage number
export function rollWeapon(stage: number, minR?: number): Weapon {
  // deeper drops lean rarer, up to a point (+0.6): even deep down about 55% are ★★★, 37% ★★ and 8% ★, so rarity still matters
  const roll = Math.random() + Math.min(stage * RARITY_STAGE_BONUS, RARITY_BONUS_MAX);
  const r = Math.max(minR || 0, roll > RARITY_3_AT ? 2 : roll > RARITY_2_AT ? 1 : 0);
  let plus = 0;
  // no cap: the stage level climbs 0.6 per stage (about +3 per sector).
  // Usually at or a little below that level; above it only 15% of the time, each further step 30%.
  if (stage >= PLUS_FROM_STAGE) {
    const lv = Math.floor((stage - PLUS_STAGE_OFFSET) * PLUS_PER_STAGE);
    if (Math.random() < PLUS_OVER_CHANCE) {
      let over = 1;
      while (Math.random() < PLUS_OVER_MORE) over++;
      plus = lv + over;
    } else plus = Math.max(0, lv - randi(0, PLUS_BELOW_MAX));
  }
  let n = 0;
  if (stage >= AFFIX1_FROM_STAGE && Math.random() < AFFIX1_BASE + (stage - AFFIX1_FROM_STAGE) * AFFIX1_PER_STAGE) n++;
  if (stage >= AFFIX2_FROM_STAGE && Math.random() < AFFIX2_BASE + (stage - AFFIX2_FROM_STAGE) * AFFIX2_PER_STAGE) n++;
  return newWeapon(pickDrop(), r, false, plus, shuffle(Object.keys(AFFIX)).slice(0, n));
}
// chipMag: share of the magazine chips' effect a weapon gets (the launcher only half, so it can't double its output)
export const magSize = (w: WeaponItem): number => {
  const def = WEAPONS[w.id],
    chip = 1 + (player.magMul - 1) * (def.chipMag ?? 1);
  return Math.max(1, Math.round(def.mag * chip * (1 + MAG_OPT_PER_LEVEL * weaponOptCount('mag', w))));
};
// rarity only; whether it's a base (never-lost) weapon is shown separately where it matters (bag, loadout)
const rarLabel = (w: WeaponItem): string => `${RARITY[w.r].stars}${RARITY[w.r].name}`;
export const weaponName = (w: WeaponItem): string =>
  `<span style="color:${w.r ? RARITY[w.r].css : 'inherit'}">${WEAPONS[w.id].name}${w.plus ? '+' + w.plus : ''}</span><em style="color:${RARITY[w.r].css}">${rarLabel(w)}</em>`;
export const weaponText = (w: WeaponItem): string =>
  t('weapon.text', {
    name: WEAPONS[w.id].name + (w.plus ? '+' + w.plus : ''),
    rar: rarLabel(w),
    opts: w.opts && w.opts.length ? w.opts.map(o => AFFIX[o].name).join(t('share.join')) : '',
  });
// split-shot: each chip adds one projectile and +20% total damage, shared across all projectiles,
// so a full hit gains the same +20% per chip whether the weapon fires 1 round or 8 pellets
// rounds per trigger pull; a weapon with maxShots (the launcher: 3 rockets) puts the split-shot bonus past that into
// each round instead, so its blasts don't flood a corridor
export const shotCount = (def: WeaponDef): number => Math.min(def.pellets + player.extra, def.maxShots ?? Infinity);
const splitMul = (def: WeaponDef): number => (def.pellets * (1 + SPLIT_DMG_PER_CHIP * player.extra)) / shotCount(def);
export const critChance = (w?: WeaponItem): number =>
  Math.min(TUNE.critCap, player.crit + CRIT_OPT_PER_LEVEL * weaponOptCount('crit', w));
// rockets burst on the first hit, so pierce bonuses widen the blast instead (+15% radius each)
export const blastRadius = (def: WeaponDef, w?: WeaponItem): number =>
  def.blast ? def.blast * (1 + PIERCE_BLAST_PER_LEVEL * (player.pierce + weaponOptCount('pierce', w))) : 0;
// The numbers below are shared by firing (firing.ts) and weaponStats, so what the screen shows is what the gun does.
// `w` picks whose options count; without it, the weapon in hand.
// seconds between shots
export const fireInterval = (def: WeaponDef, w?: WeaponItem): number =>
  (def.rate / player.fireRate) * Math.pow(RATE_OPT_MUL, weaponOptCount('rate', w));
// seconds a reload takes
export const reloadTime = (def: WeaponDef, w?: WeaponItem): number =>
  def.reload * player.reloadMul * Math.pow(RELOAD_OPT_MUL, weaponOptCount('reload', w));
// damage of one projectile
export const shotDamage = (def: WeaponDef, w: WeaponItem): number =>
  def.dmg * wDmgMul(w) * player.dmgMul * splitMul(def);
// Effective numbers for a weapon with the player's current chips / upgrades and the weapon's own options.
// dps = sustained damage per second on one target, including reloads and average crits. What it leaves out is given
// apart: farDps = the rail's dps on targets past `far` metres; blast = the rocket's blast radius (every enemy caught
// in it takes the hit, up to full damage near the centre).
export function weaponStats(w: WeaponItem) {
  const def = WEAPONS[w.id];
  const perHit = shotDamage(def, w);
  const hits = shotCount(def);
  const interval = fireInterval(def, w);
  const mag = magSize(w);
  const reload = reloadTime(def, w);
  const dps = ((perHit * hits * mag) / (mag * interval + reload)) * (1 + critChance(w));
  return {
    perHit,
    hits,
    mag,
    interval,
    dps,
    far: def.far || 0,
    farDps: def.far ? dps * def.farMul! : 0,
    blast: blastRadius(def, w),
  };
}
export const weaponOptsHTML = (w: WeaponItem): string =>
  w.opts && w.opts.length ? `<span class="wopt">${w.opts.map(o => AFFIX[o].text).join(' / ')}</span>` : '';
