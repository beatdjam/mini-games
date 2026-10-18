import type { WeaponDef, Rarity, Affix } from './types.ts';
import { withLang } from '@engine/core/langslots.ts';
import { COLOR, CSS_COLOR } from './colors.ts';
// Weapons: types, rarity, options, drop pool, base-side modding costs
export const WEAPONS = withLang<WeaponDef, 'name' | 'desc'>(
  {
    pistol: {
      dmg: 28,
      rate: 0.26,
      spread: 0.012,
      pellets: 1,
      speed: 75,
      mag: 12,
      reload: 1.1,
      color: COLOR.cyan,
      cost: 0,
    },
    // SMG: light rounds, very fast, big magazine, no extra spread while moving
    smg: {
      dmg: 8,
      rate: 0.062,
      spread: 0.05,
      pellets: 1,
      speed: 70,
      mag: 45,
      reload: 1.7,
      steady: true,
      color: COLOR.lime,
      cost: 250,
    },
    // shotgun: 8 pellets; the closer you are, the more of them land
    shotgun: {
      dmg: 12,
      rate: 0.7,
      spread: 0.065,
      pellets: 8,
      speed: 65,
      mag: 6,
      reload: 2.0,
      kb: 0.8,
      color: COLOR.amber,
      cost: 320,
    },
    // rail: one heavy piercing round, stronger the farther it travels
    rail: {
      dmg: 125,
      rate: 1.1,
      spread: 0,
      pellets: 1,
      speed: 200,
      mag: 4,
      reload: 2.2,
      pierce: 4,
      far: 15,
      farMul: 1.5,
      steady: true,
      color: COLOR.violet,
      cost: 520,
    },
    // launcher: slow rocket, full damage near the centre of the blast, nudges enemies back; the enemy it hits takes
    // half as much again
    launcher: {
      dmg: 110,
      rate: 1.15,
      spread: 0.008,
      pellets: 1,
      speed: 28,
      mag: 3,
      direct: 0.5,
      reload: 2.4,
      maxShots: 3,
      blast: 5,
      grav: 3.5,
      chipMag: 0.5,
      color: COLOR.fire,
      cost: 700,
    },
  },
  { name: '', desc: '' },
);
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rail', 'launcher'];
export const DROP_POOL = [
  'pistol',
  'pistol',
  'smg',
  'smg',
  'smg',
  'shotgun',
  'shotgun',
  'shotgun',
  'rail',
  'rail',
  'launcher',
];
// rarity rank is shown as stars and a grey -> blue -> gold colour so the order reads at a glance
export const RARITY = withLang<Rarity, 'name'>(
  [
    { stars: '★', mult: 1, css: '#9aa8b4', hex: 0x9aa8b4 },
    { stars: '★★', mult: 1.25, css: '#4da6ff', hex: 0x4da6ff },
    { stars: '★★★', mult: 1.55, css: CSS_COLOR.amber, hex: COLOR.amber },
  ],
  { name: '' },
);
// per-level multiplier of the fire-rate / reload options (applied as Math.pow(MUL, level))
export const RATE_OPT_MUL = 0.91,
  RELOAD_OPT_MUL = 0.8;
// per-level additive bonuses of the other weapon options (and, for the split shot, of the chip); the actual rules and
// the pause screen's stats panel both read these
export const MAG_OPT_PER_LEVEL = 0.3, // magazine size per mag option
  CRIT_OPT_PER_LEVEL = 0.08, // crit chance per crit option
  SPEED_OPT_PER_LEVEL = 0.06, // move speed per speed option (+6%)
  GAIN_OPT_PER_LEVEL = 0.1, // bits per gain option (+10%)
  LEECH_OPT_HP = 2, // HP per kill from each leech option
  SPLIT_DMG_PER_CHIP = 0.2; // total damage per split-shot chip
// weapon options: only active while that weapon is in hand
export const AFFIX = withLang<Affix, 'name' | 'text'>(
  {
    mag: {},
    reload: {},
    rate: {},
    crit: {},
    leech: {},
    speed: {},
    pierce: {},
    gain: {},
  },
  { name: '', text: '' },
);
export const PLUS_DMG = 0.08;
// split-shot on a single-round weapon fans the rounds out sideways: `step` radians apart,
// squeezed together once the whole fan would be wider than `max`, so a big stack still lands on one target
export const SPLIT_FAN = { step: 0.05, max: 0.15 };
// split-shot chips stop being offered at this many
export const SPLIT_MAX = 7;
// base-side modding of basic weapons: persistent +value / rarity per weapon type (kept on death)
// the + value of a dropped weapon by progress (actors/weapons.ts rollWeapon): none before PLUS_FROM_STAGE, then a level
// that climbs PLUS_PER_STAGE a stage from PLUS_STAGE_OFFSET; usually at that level or up to PLUS_BELOW_MAX under it
export const PLUS_FROM_STAGE = 2.5,
  PLUS_STAGE_OFFSET = 2,
  PLUS_PER_STAGE = 0.6,
  PLUS_BELOW_MAX = 2;
// A base weapon is handed out for a dive's start depth (core/rules.ts basicNow): its + value SUPPLY_PLUS_BELOW under the
// drops' level there (about what they average), its rarity ★★ from the depth SUPPLY_RARITY_AT[0] (0-based) and ★★★
// from SUPPLY_RARITY_AT[1] (most drops that deep are). Was 2 under and plain rarity: a dive started again from a milestone
// after a death got stuck at its first boss, a weapon and some chips short of the dive that got there (sim, 2026-10-18)
export const SUPPLY_PLUS_BELOW = 1,
  SUPPLY_RARITY_AT = [9, 19];
