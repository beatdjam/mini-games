import type { Upgrade, PresUpgrade } from './types.ts';
// Run structure, balance numbers, base upgrades, reboot upgrades, inventory sizes
export const PER = 4; // 3 floors + boss per depth
// health grows by these factors per depth (compounding). Enemies trail the player's growth a little; bosses stay a wall.
// The player's own growth (additive chips, +8% per weapon +) slows down gradually, to about 1.3x per depth deep down,
// so the per-depth factor slides the same way: `rate` up to GROWTH_SLIDE[0] depths in, then (geometrically) down to
// the *_LATE factor by GROWTH_SLIDE[1], `late` after that. A sudden switch made the depths just past it easier than
// the one before it.
export const DEPTH_HP_GROWTH = 1.55, DEPTH_HP_LATE = 1.22, GROWTH_SLIDE = [2, 11];
// health factor after `depths` depths (the log of the per-depth factor moves in a straight line across the slide)
export function hpGrowth(depths: number, rate: number, late: number): number {
  const [a, b] = GROWTH_SLIDE as [number, number], lr = Math.log(rate), ll = Math.log(late);
  if (depths <= a) return Math.pow(rate, depths);
  const s = Math.min(depths, b) - a;
  return Math.exp(lr * (a + s) - (lr - ll) * s * s / (2 * (b - a)) + ll * Math.max(0, depths - b));
}
export const enemyGrowth = (depths: number): number => hpGrowth(depths, DEPTH_HP_GROWTH, DEPTH_HP_LATE);
// player-side tuning knobs. Enemy numbers live in ENEMY, boss numbers in js/actors/bosses/*.js
export const TUNE = {
  hp: 100,              // base max HP (armour upgrade adds 15 per level)
  moveSpeed: 7.4,       // base move speed (m/s)
  stamina: 100,         // base max stamina (endurance upgrade adds 20 per level)
  staminaRegen: 34,     // stamina per second (cooling upgrade adds 12% per level)
  staminaDelay: 0.5,    // seconds after a dash before stamina refills
  dashCost: 45,
  dashTime: 0.2,        // seconds
  dashSpeed: 3.3,       // multiplier on move speed while dashing
  dashInvuln: 0.32,     // seconds of invulnerability from a dash
  hitInvuln: 0.45,      // seconds of invulnerability after taking a hit
  kitHeal: 40,          // a med kit heals this much, or kitHealPct of max HP when that is more (max HP grows deep down)
  kitHealPct: 0.25,
  kitStart: 1,          // kits at the start of a run (first-aid upgrade adds 1 per level)
  kitDropChance: 0.06,  // chance an enemy drops a kit
  chipChance: 0.5,      // chance a cleared room gives a chip (otherwise a kit + bits); about 8 chips per depth incl. the boss
  rareChipChance: 0.12, // chance each offered chip is the rare (gold, stronger) version
  supplyTimes: 5,       // a shortcut supply pick (one per skipped depth) gives the chosen chip this many times
  // what the supply picks are worth in the start-depth readiness: exp(a * picks ^ b). Chips of different kinds multiply
  // but the same kind only adds up, so each further pick is worth a little less (fitted to a deep run's chip mix, split-shot capped at SPLIT_MAX)
  supplyCurve: [0.6, 0.69],
  critCap: 0.4,         // crit chance can't go above this
  hitDirTime: 0.6,      // seconds the red arc pointing at an off-screen attacker stays up (ui/hud.ts hitDirection)
  deathBitsKeep: 0.5,   // share of the run's bits kept on death / abandon
};
export const UPGRADES: Upgrade[] = [
  { id: 'hp',   max: 6, cost: l => Math.round(80 * Math.pow(1.6, l)) },
  { id: 'dmg',  max: 6, cost: l => Math.round(100 * Math.pow(1.6, l)) },
  { id: 'spd',  max: 4, cost: l => Math.round(90 * Math.pow(1.7, l)) },
  { id: 'dash', max: 4, cost: l => Math.round(90 * Math.pow(1.7, l)) },
  { id: 'gain', max: 5, cost: l => Math.round(150 * Math.pow(1.7, l)) },
  { id: 'stam', max: 4, cost: l => Math.round(90 * Math.pow(1.7, l)) },
  { id: 'kit',  max: 2, cost: l => Math.round(220 * Math.pow(2, l)) },
  { id: 'chip', max: 2, cost: l => Math.round(450 * Math.pow(2.2, l)) },
];
export const PRES_UP: PresUpgrade[] = [
  { id: 'gain',   max: 5, cost: 1 },
  { id: 'hp',     max: 5, cost: 1 },
  { id: 'funds',  max: 3, cost: 1 },
  { id: 'relic',  max: 2, cost: 2 },
  { id: 'choice', max: 1, cost: 3 },
  // no cap: something to spend points on once the rest is bought, so every reboot still makes you stronger.
  // The cost climbs by 1 pt per level (1, 2, 3, ...), so it grows slowly
  { id: 'dmg',    max: Infinity, cost: 1, step: 1 },
  { id: 'vit',    max: Infinity, cost: 1, step: 1 },
];
// per level of the uncapped reboot bonuses: damage +5% (added to the base "output" upgrade), max HP +5% (multiplied)
export const PRES_ENDLESS = { dmg: 0.05, vit: 0.05 };
export const STASH_MAX = 12, BAG_MAX = 4, KIT_MAX = 3;
export const ASSIST: Record<string, number> = { off: 0, weak: 0.04, strong: 0.1 };
