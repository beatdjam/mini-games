import type { EnemyDef } from './types.ts';
import { COLOR } from './colors.ts';
// Enemy types and their tuning
export const ENEMY: Record<string, EnemyDef> = {
  crawler: { hp: 30,  speed: 6.4, r: 0.55, y: 0.6, hitR: 0.85, dmg: 10, melee: true, bits: 3, color: 0xff4d8d, geo: 'tetra' },
  drone:   { hp: 24,  speed: 3.4, r: 0.5,  y: 2.3, hitR: 0.8,  dmg: 8,  fly: true, keep: 9, bits: 3, color: COLOR.yellow, geo: 'octa',
             ranged: { rate: 1.9, speed: 14, count: 1, spread: 0 } },
  turret:  { hp: 60,  speed: 0,   r: 0.8,  y: 0.9, hitR: 1.1,  dmg: 9,  bits: 5, color: 0x8cff6a, geo: 'cyl',
             ranged: { rate: 2.2, speed: 12, count: 3, spread: 0.2 } },
  brute:   { hp: 150, speed: 2.5, r: 1.0,  y: 1.1, hitR: 1.45, dmg: 14, melee: true, bits: 10, color: 0xff8a3d, geo: 'box',
             ranged: { rate: 2.8, speed: 11, count: 5, spread: 0.22 } },
  // aims a visible laser for a second, then fires one fast, heavy round
  sniper:  { hp: 40,  speed: 2.4, r: 0.5,  y: 0.95, hitR: 0.8, dmg: 24, keep: 18, sniper: true, bits: 6, color: 0x9fe7ff, geo: 'rod' },
  // blocks bullets from the front but turns slowly (turn rad/s); the shield breaks after shieldHp damage and staggers it
  shield:  { hp: 90,  speed: 3.1, r: 0.8,  y: 1.0, hitR: 1.0,  dmg: 12, melee: true, shield: true, shieldHp: 90, turn: 1.6, bits: 7, color: 0x8cc8ff, geo: 'slab' },
  // rushes in and detonates; also blows up when shot, hurting nearby enemies too
  bomber:  { hp: 16,  speed: 7.8, r: 0.5,  y: 0.6, hitR: 0.75, dmg: 26, bomber: true, bits: 3, color: COLOR.bomber, geo: 'ico' },
  splitter:{ hp: 70,  speed: 4.0, r: 0.8,  y: 0.9, hitR: 1.1,  dmg: 12, melee: true, split: true, bits: 6, color: 0x7dffcf, geo: 'dodeca' },
  // humanoid robot soldier: keeps a middle distance and fires 3-round bursts. Not tied to a sector: a few turn up
  // everywhere (ENEMY_TUNE.trooperChance). Built from boxes with jointed limbs (buildHumanoid in js/world/entities.ts)
  trooper: { hp: 75,  speed: 3.6, r: 0.55, y: 1.05, hitR: 0.9, dmg: 8,  keep: 11, humanoid: true, bits: 8, color: 0xb48cff, geo: 'humanoid',
             ranged: { rate: 2.3, speed: 18, count: 1, spread: 0, burst: 3, burstGap: 0.13 }, muzzle: 0.45 },
  // Bastion's shield generators (boss minion only)
  bturret: { hp: 140, speed: 0,   r: 0.8,  y: 0.9, hitR: 1.2,  dmg: 9,  bits: 2, color: 0xffb347, geo: 'cyl',
             ranged: { rate: 1.7, speed: 13, count: 3, spread: 0.16 } },
  mini:    { hp: 16,  speed: 7.2, r: 0.4,  y: 0.4, hitR: 0.6,  dmg: 6,  melee: true, bits: 1, color: 0x7dffcf, geo: 'tetraS' },
};
// regular enemies (not bosses): overall knobs on top of the per-type numbers in ENEMY
export const ENEMY_TUNE = {
  maxPerRoom: 11,     // cap on enemies in one room
  elitePerDepth: 0.1, // per depth, extra chance a spawn is one of the biome's tougher types (up to eliteMax)
  eliteMax: 0.5,
  hpMul: 1.4,         // health multiplier
  dmgMul: 1.25,       // damage multiplier
  fireInterval: 0.85, // multiplier on ranged / sniper cooldowns (smaller = shoots more often)
  wakeTiles: 7,       // wakes when the player is within this many tiles of walking distance and in sight
  trooperChance: 0.06, // chance any spawn in any sector is a trooper (the humanoid soldier) instead
};
// tougher enemy types, favoured more the deeper you go
export const ELITE_TYPES = ['sniper', 'shield', 'brute', 'bomber', 'splitter', 'turret'];
