import type { WeaponDef, Rarity, Affix } from './types.ts';
import { withLang } from './langslots.ts';
import { COLOR, CSS_COLOR } from './colors.ts';
// Weapons: types, rarity, options, drop pool, base-side modding costs
export const WEAPONS = withLang<WeaponDef, 'name' | 'desc'>(
  {
    pistol: {
      dmg: 16,
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
      dmg: 6,
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
      dmg: 13,
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
      dmg: 90,
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
    // launcher: slow rocket, full damage near the centre of the blast, nudges enemies back
    launcher: {
      dmg: 70,
      rate: 1.15,
      spread: 0.008,
      pellets: 1,
      speed: 28,
      mag: 2,
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
// the + cap rises with the deepest depth opened in this reboot cycle (modPlusCap in src/core/rules.ts): at least
// MOD_PLUS_MAX, else that depth x MOD_CAP_PER_DEPTH. That keeps a base weapon a little behind the drops found that
// deep, so after a death you can climb back from a depth or two shallower (not from the same one)
export const MOD_PLUS_MAX = 10,
  MOD_CAP_PER_DEPTH = 1.5;
// x1.5 per level up to +10, then only x1.2 per level so the raised cap stays within reach
export const modPlusCost = (plus: number): number =>
  Math.round(50 * Math.pow(1.5, Math.min(plus, MOD_PLUS_MAX)) * Math.pow(1.2, Math.max(0, plus - MOD_PLUS_MAX)));
export const MOD_RARITY_COST = [300, 900]; // to ★★ and to ★★★
