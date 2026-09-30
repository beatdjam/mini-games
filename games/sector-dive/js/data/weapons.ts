import type { WeaponDef, Rarity, Affix } from './types.ts';
// Weapons: types, rarity, options, drop pool, base-side modding costs
export const WEAPONS: Record<string, WeaponDef> = {
  pistol:   { dmg: 16, rate: 0.26,  spread: 0.012, pellets: 1, speed: 75,  mag: 12, reload: 1.1, color: 0x54e8ff, cost: 0 },
  // SMG: light rounds, very fast, big magazine, no extra spread while moving
  smg:      { dmg: 6,  rate: 0.062, spread: 0.05,  pellets: 1, speed: 70,  mag: 45, reload: 1.7, steady: true, color: 0x8cff6a, cost: 250 },
  // shotgun: 8 pellets; the closer you are, the more of them land
  shotgun:  { dmg: 13, rate: 0.7,   spread: 0.065, pellets: 8, speed: 65,  mag: 6,  reload: 2.0, kb: 0.8, color: 0xffc24a, cost: 320 },
  // rail: one heavy piercing round, stronger the farther it travels
  rail:     { dmg: 90, rate: 1.1,   spread: 0,     pellets: 1, speed: 200, mag: 4,  reload: 2.2, pierce: 4, far: 15, farMul: 1.5, steady: true, color: 0xc58cff, cost: 520 },
  // launcher: slow rocket, full damage near the centre of the blast, knocks enemies back
  launcher: { dmg: 52, rate: 1.15,  spread: 0.008, pellets: 1, speed: 28,  mag: 2,  reload: 2.9, maxShots: 3, blast: 5, grav: 3.5, chipMag: 0.5, color: 0xff6a3d, cost: 700 },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rail', 'launcher'];
export const DROP_POOL = ['pistol', 'pistol', 'smg', 'smg', 'smg', 'shotgun', 'shotgun', 'shotgun', 'rail', 'rail', 'launcher'];
// rarity rank is shown as stars and a grey -> blue -> gold colour so the order reads at a glance
export const RARITY: Rarity[] = [
  { stars: '★',   mult: 1,    css: '#9aa8b4', hex: 0x9aa8b4 },
  { stars: '★★',  mult: 1.25, css: '#4da6ff', hex: 0x4da6ff },
  { stars: '★★★', mult: 1.55, css: '#ffc24a', hex: 0xffc24a },
];
// weapon options: only active while that weapon is in hand
export const AFFIX: Record<string, Affix> = {
  mag:    {},
  reload: {},
  rate:   {},
  crit:   {},
  leech:  {},
  speed:  {},
  pierce: {},
  gain:   {},
};
export const PLUS_DMG = 0.08;
// split-shot on a single-round weapon fans the rounds out sideways: `step` radians apart,
// squeezed together once the whole fan would be wider than `max`, so a big stack still lands on one target
export const SPLIT_FAN = { step: 0.05, max: 0.15 };
// split-shot chips stop being offered at this many
export const SPLIT_MAX = 7;
// base-side modding of basic weapons: persistent +value / rarity per weapon type (kept on death)
// the + cap rises with the deepest depth opened in this reboot cycle (modPlusCap in js/system/rules.ts): at least
// MOD_PLUS_MAX, else that depth x MOD_CAP_PER_DEPTH. That keeps a base weapon a little behind the drops found that
// deep, so after a death you can climb back from a depth or two shallower (not from the same one)
export const MOD_PLUS_MAX = 10, MOD_CAP_PER_DEPTH = 1.5;
// x1.5 per level up to +10, then only x1.2 per level so the raised cap stays within reach
export const modPlusCost = (plus: number): number => Math.round(50 * Math.pow(1.5, Math.min(plus, MOD_PLUS_MAX)) * Math.pow(1.2, Math.max(0, plus - MOD_PLUS_MAX)));
export const MOD_RARITY_COST = [300, 900]; // to ★★ and to ★★★
