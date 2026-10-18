import type { Upgrade } from './types.ts';
import { withLang } from '@engine/core/langslots.ts';
// Run structure, balance numbers, base upgrades, reboot upgrades, inventory sizes
export const PER = 4; // 3 floors + boss per depth
// health grows by these factors per depth (compounding). Enemies trail the player's growth a little; bosses stay a wall.
// The player's own growth (additive chips, +8% per weapon +) slows down gradually, to about 1.3x per depth deep down,
// so the per-depth factor slides the same way: `rate` up to GROWTH_SLIDE[0] depths in, then (geometrically) down to
// the *_LATE factor by GROWTH_SLIDE[1], `late` after that. A sudden switch made the depths just past it easier than
// the one before it. The late factor went from 1.22 to 1.25 (2026-10-18) when levels came to be bought in a dive (at
// the milestones): the sim's dives went from 25 depths (median) to 29
export const DEPTH_HP_GROWTH = 1.55,
  DEPTH_HP_LATE = 1.25;
const GROWTH_SLIDE = [2, 11];
// health factor after `depths` depths (the log of the per-depth factor moves in a straight line across the slide)
export function hpGrowth(depths: number, rate: number, late: number): number {
  const [a, b] = GROWTH_SLIDE as [number, number],
    lr = Math.log(rate),
    ll = Math.log(late);
  if (depths <= a) return Math.pow(rate, depths);
  const s = Math.min(depths, b) - a;
  return Math.exp(lr * (a + s) - ((lr - ll) * s * s) / (2 * (b - a)) + ll * Math.max(0, depths - b));
}
export const enemyGrowth = (depths: number): number => hpGrowth(depths, DEPTH_HP_GROWTH, DEPTH_HP_LATE);
// damage taken grows this much per progress (progressOf); the start-depth readiness uses it too (progress per depth is 5)
export const DMG_SCALE_PER_PROG = 0.045;
// player-side tuning knobs. Enemy numbers live in ENEMY, boss numbers in src/actors/bosses/*.ts
export const TUNE = {
  hp: 100, // base max HP (armour upgrade adds 15 per level)
  moveSpeed: 7.4, // base move speed (m/s)
  stamina: 100, // base max stamina (endurance upgrade adds 20 per level)
  staminaRegen: 34, // stamina per second (cooling upgrade adds 12% per level)
  staminaRegenCap: 102, // the chips can't take the regen above this (3x the base: a dash is back in about a second)
  staminaDelay: 0.5, // seconds after a dash before stamina refills
  dashCost: 45,
  dashTime: 0.2, // seconds
  dashSpeed: 3.3, // multiplier on move speed while dashing
  dashInvuln: 0.32, // seconds of invulnerability from a dash
  sprintSpeed: 1.5, // multiplier on move speed while running (the dash held on after a dash)
  sprintCost: 12, // stamina per second while running
  hitInvuln: 0.45, // seconds of invulnerability after taking a hit
  kitHeal: 40, // a med kit heals this much, or kitHealPct of max HP when that is more (max HP grows deep down)
  kitHealPct: 0.25,
  kitStart: 1, // kits at the start of a run (first-aid upgrade adds 1 per level)
  kitDropChance: 0.06, // chance an enemy drops a kit
  chipChance: 0.3, // chance a cleared room gives a chip (otherwise a kit + bits); 4 or 5 chips from the rooms of a building
  rareChipChance: 0.12, // chance each offered chip is the rare (gold, stronger) version
  supplyTimes: 7, // a shortcut supply pick (one per skipped depth) gives the chosen chip this many times (5 until
  // 2026-10-18: a dive started again from a milestone had some 110 chips where the dive that got there had 165 to 180)
  // what the supply picks are worth in the start-depth readiness: exp(a * picks ^ b). Chips of different kinds multiply
  // but the same kind only adds up, so each further pick is worth a little less (fitted to a deep run's chip mix, split-shot capped at SPLIT_MAX)
  supplyCurve: [0.6, 0.69],
  critCap: 0.4, // crit chance can't go above this
  hitDirTime: 0.6, // seconds the red arc pointing at an off-screen attacker stays up (ui/hud.ts hitDirection)
  deathBitsKeep: 0.5, // share of the run's bits kept on death / abandon
};
// The level: bits buy one level at a time, and each level is a point put into one of these (save.up holds the points).
// A level costs the same whatever it goes to, more for each level already bought (levelCost). Armour and output have
// no cap (something to spend on however far one has come); the rest stop where more would break the game's feel
// (Infinity: no cap). Replaced the base upgrades with their own prices and the reboot (2026-10-17)
export const UPGRADES = withLang<Upgrade, 'name' | 'desc'>(
  [
    { id: 'hp', max: Infinity },
    { id: 'dmg', max: Infinity },
    { id: 'spd', max: 4 },
    { id: 'dash', max: 4 },
    { id: 'gain', max: 5 },
    { id: 'stam', max: 4 },
    { id: 'kit', max: 2 },
    { id: 'chip', max: 2 },
    { id: 'choice', max: 1 },
  ],
  { name: '', desc: () => '' },
);
// what level `l` (the levels bought so far) costs: 80 bits, 20% more each level. The bits a dive brings in grow about 1.3
// to 1.6 times a depth (sim, 2026-10-18: some 2,500 by DEPTH 5, 25,000 by 10, 330,000 by 20), so a level's price must
// climb with them: at 8% a level, half of a dive to DEPTH 20 bought 66 levels, twice the old base upgrades all bought.
// At 20% it buys 32 (about the old ones all bought); a whole dive, 10 levels by DEPTH 5, 22 by 10, 36 by 20
export const levelCost = (l: number): number => Math.round(80 * Math.pow(1.2, l));
// The milestones of the depths: DEPTH 5, 10, 15, ... (0-based tiers 4, 9, 14, ...). A dive that dies starts again from
// the last one passed (milestoneBelow); one that comes back starts where it left off. DEPTH 1 is where it all begins
export const MILESTONE_EVERY = 5;
export const milestoneBelow = (tier: number): number =>
  tier < MILESTONE_EVERY - 1 ? 0 : tier - ((tier - (MILESTONE_EVERY - 1)) % MILESTONE_EVERY);
export const isMilestone = (tier: number): boolean => tier > 0 && milestoneBelow(tier) === tier;
export const HP_PER_POINT = 15, // max HP per point in armour
  DMG_PER_POINT = 0.08; // damage per point in output
export const STASH_MAX = 12,
  BAG_MAX = 4,
  KIT_MAX = 3;
export const ASSIST: Record<string, number> = { off: 0, weak: 0.04, strong: 0.1 };
