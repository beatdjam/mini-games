import type { Upgrade, PresUpgrade } from './types.ts';
// Run structure, balance numbers, base upgrades, reboot upgrades, inventory sizes
export const PER = 4; // 3 floors + boss per depth
// health grows by these factors per depth (compounding). Enemies trail the player's growth a little; bosses stay a wall.
export const DEPTH_HP_GROWTH = 1.55;
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
  kitHeal: 40,
  kitStart: 1,          // kits at the start of a run (first-aid upgrade adds 1 per level)
  kitDropChance: 0.06,  // chance an enemy drops a kit
  chipChance: 0.5,      // chance a cleared room gives a chip (otherwise a kit + bits); about 8 chips per depth incl. the boss
  rareChipChance: 0.12, // chance each offered chip is the rare (gold, stronger) version
  critCap: 0.4,         // crit chance can't go above this
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
];
export const STASH_MAX = 12, BAG_MAX = 4, KIT_MAX = 3;
export const ASSIST = { off: 0, weak: 0.04, strong: 0.1 };
