// The look of a shot (SB-1450): the muzzle's flash, the tracer band that shows a bullet in flight, and the sparks and
// smoke of an impact. The values are provisional and are meant to be settled by eye in #view-gunfire; view/gunfire.ts
// draws them and test/e2e/battle.test.ts's scene gives the draw counts.
import { GUNFIRE_COLOR } from './colors.ts';
import type { WeaponId } from './weapons.ts';

export interface MuzzleFlashDef {
  size: number; // how wide the flash is (m)
  life: number; // how long it shows (s); 3 frames at 60 fps is 0.05
  color: number; // its colour (0xRRGGBB)
}

export interface ImpactDef {
  surfaceSparks: number; // the sparks a shot into sand or a prop throws
  metalSparks: number; // the sparks a shot into a target, an enemy or the mech throws
  sparkSpeed: number; // how fast a spark flies out (m/s)
  sparkLife: number; // how long a spark lives (s)
  sparkGravity: number; // how fast a spark falls (m/s^2)
  sparkSize: number; // a spark's size (m)
  smokeSize: number; // the puff's size when it appears (m)
  smokeGrow: number; // how much bigger it gets by the end (times the size)
  smokeRise: number; // how fast the puff climbs (m/s)
  smokeLife: number; // how long the puff stays (s)
  smokeColor: number; // a fresh puff's colour (0xRRGGBB)
  smokeFade: number; // the colour it takes before it goes (0xRRGGBB)
}

// The pools are fixed so that a frame never makes a mesh: a part takes a free slot first and only overwrites the oldest
// when its pool is full. `tracers` is the most bullets drawn at once (the rest fly unseen), the others are the most
// flashes, sparks and puffs on screen at once.
export const GUNFIRE_CAP = {
  tracers: 128,
  flashes: 24,
  sparks: 160,
  smoke: 48,
} as const;

// The impact sparks scatter from a generator of their own, seeded here: the look must not touch the game's random stream
// (SPEC §3), and a fixed seed keeps the same sparks every run.
export const GUNFIRE_SEED = 0x3c6a91d2;

export const GUNFIRE_TUNE = {
  tracer: {
    length: 8, // how far behind its head a bullet's band reaches (m)
    width: 0.4, // the band's width at its head (m)
    tail: 0.35, // the share of the head's brightness the tail keeps; 0 fades it out
  },
  flash: {
    autocannon: { size: 1, life: 0.08, color: GUNFIRE_COLOR.mechMuzzle },
    heavyGun: { size: 1.6, life: 0.1, color: GUNFIRE_COLOR.mechMuzzle },
    enemy: { size: 2, life: 0.16, color: GUNFIRE_COLOR.enemyMuzzle },
  } satisfies Record<WeaponId | 'enemy', MuzzleFlashDef>,
  impact: {
    surfaceSparks: 16,
    metalSparks: 22,
    sparkSpeed: 9,
    sparkLife: 0.35,
    sparkGravity: 12,
    sparkSize: 0.25,
    smokeSize: 1.5,
    smokeGrow: 2.6,
    smokeRise: 1.4,
    smokeLife: 1.2,
    smokeColor: GUNFIRE_COLOR.smoke,
    smokeFade: GUNFIRE_COLOR.smokeFade,
  } satisfies ImpactDef,
} as const;

// The kind of flash a table row draws: the mech's two weapons, or the enemies' one.
export type FlashKind = keyof typeof GUNFIRE_TUNE.flash;

// How a part changes over its life, shared by every impact: where a flash, a spark and a puff start to fade, how much
// speed a spark keeps when it bounces, and how much the values each impact draws vary. They live here so the drawing
// makes no number up of its own.
export const GUNFIRE_LOOK = {
  flashFadeFrom: 0.35, // the share of the flash's life before it starts to fade
  sparkBounce: 0.3, // the share of its speed a spark keeps when it bounces
  sparkDrag: 0.55, // the share of its sideways speed a spark keeps per bounce
  sparkGround: 0.05, // where a spark bounces (m)
  smokeFadeFrom: 0.45, // the share of the puff's life before it takes the fade's colour
  sparkSpeedMin: 0.5, // a spark's speed is the row's value times sparkSpeedMin..sparkSpeedMin + sparkSpeedVar
  sparkSpeedVar: 0.7,
  sparkLifeMin: 0.7, // a spark's life, the same way
  sparkLifeVar: 0.6,
} as const;
