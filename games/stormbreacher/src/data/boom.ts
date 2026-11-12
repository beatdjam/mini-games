// The look of an explosion (SB-1340): the fireball, the column of black smoke, the debris it throws and the column of
// sand or water it lifts. Each kind of thing that blows up has its own row; the values are provisional and are meant to
// be settled by eye in #view-boom. view/boom.ts draws them and view/feel.ts takes the shake.
import { BOOM_COLOR } from './colors.ts';

export type BoomKind = 'small' | 'large' | 'craft' | 'water';

export interface BoomFire {
  radius: number; // how big the flash grows (m)
  life: number; // how long the flash lasts (s)
  color: number; // its colour (0xRRGGBB)
}

export interface BoomSmoke {
  count: number; // the puffs one explosion makes
  rise: number; // how fast a puff climbs (m/s)
  spread: number; // the widest a puff starts from the centre (m)
  size: number; // a puff's size when it appears (m)
  grow: number; // how much bigger it gets by the end (times the size)
  life: number; // how long the column stays (s); single puffs vary around it
  color: number; // a fresh puff's colour (0xRRGGBB)
  fade: number; // the colour a puff takes before it goes (0xRRGGBB)
}

export interface BoomDebris {
  count: number; // the pieces thrown
  speed: number; // how fast a piece flies out (m/s)
  gravity: number; // the downward pull on a piece (m/s^2)
  life: number; // how long a piece flies (s)
  size: number; // a piece's size (m)
  color: number; // its colour (0xRRGGBB)
}

export interface BoomColumn {
  height: number; // how high the sand or water climbs (m)
  radius: number; // how wide its foot is (m)
  life: number; // how long it lasts (s)
  color: number; // its colour (0xRRGGBB)
}

export interface BoomDef {
  fire: BoomFire;
  smoke: BoomSmoke;
  debris: BoomDebris;
  column: BoomColumn;
  shake: number; // the camera's shake at the nearest distance (m)
}

// The pools are fixed so that a frame never makes a mesh: more than this at once and the oldest is reused. The counts
// are the most the four kinds together may have on screen.
export const BOOM_CAP = {
  fire: 20,
  smoke: 520,
  debris: 560,
  column: 36,
} as const;

// How the shake falls off: a blast at `near` m shakes the camera by the row's `shake`, one at `far` m or farther does
// not shake it at all. The falloff is squared, so a blast a little way off is much gentler than one at the feet.
export const BOOM_SHAKE = { near: 10, far: 90 } as const;

export const BOOM_DEFS: Record<BoomKind, BoomDef> = {
  // an enemy or a prop breaks: enough to read, small enough for a stream of them
  small: {
    fire: { radius: 2.4, life: 0.45, color: BOOM_COLOR.fire },
    smoke: {
      count: 10,
      rise: 1.7,
      spread: 1.5,
      size: 1.1,
      grow: 2.2,
      life: 7,
      color: BOOM_COLOR.smoke,
      fade: BOOM_COLOR.smokeFade,
    },
    debris: { count: 18, speed: 9, gravity: 18, life: 1.1, size: 0.14, color: BOOM_COLOR.debris },
    column: { height: 2.8, radius: 1.6, life: 0.9, color: BOOM_COLOR.sand },
    shake: 0.18,
  },
  // a target, a mine or a mortar shell: the blast the player is meant to feel
  large: {
    fire: { radius: 5.4, life: 0.7, color: BOOM_COLOR.fireLarge },
    smoke: {
      count: 34,
      rise: 2.5,
      spread: 3.4,
      size: 1.8,
      grow: 2.8,
      life: 8.5,
      color: BOOM_COLOR.smoke,
      fade: BOOM_COLOR.smokeFade,
    },
    debris: { count: 46, speed: 15, gravity: 20, life: 1.7, size: 0.2, color: BOOM_COLOR.debris },
    column: { height: 7.2, radius: 3.6, life: 1.5, color: BOOM_COLOR.sand },
    shake: 0.7,
  },
  // a landing craft blows up: the biggest of them, and the one the opening cutscene leans on
  craft: {
    fire: { radius: 7.4, life: 0.9, color: BOOM_COLOR.fireCraft },
    smoke: {
      count: 58,
      rise: 3,
      spread: 4.8,
      size: 2.4,
      grow: 3,
      life: 9.5,
      color: BOOM_COLOR.smoke,
      fade: BOOM_COLOR.smokeFade,
    },
    debris: { count: 72, speed: 18, gravity: 20, life: 2.3, size: 0.24, color: BOOM_COLOR.debris },
    column: { height: 9.4, radius: 5, life: 1.9, color: BOOM_COLOR.sand },
    shake: 1,
  },
  // a shell that falls into the sea: a fireball on the water, spray instead of sand and a paler column
  water: {
    fire: { radius: 3.6, life: 0.55, color: BOOM_COLOR.fireWater },
    smoke: {
      count: 18,
      rise: 2.2,
      spread: 2.8,
      size: 1.6,
      grow: 2.5,
      life: 7.5,
      color: BOOM_COLOR.smoke,
      fade: BOOM_COLOR.smokeFade,
    },
    debris: { count: 22, speed: 11, gravity: 22, life: 1.3, size: 0.16, color: BOOM_COLOR.spray },
    column: { height: 9, radius: 2.4, life: 1.7, color: BOOM_COLOR.water },
    shake: 0.4,
  },
};

// The camera's shake a blast `distance` m away asks for (m). The row's `shake` is at `BOOM_SHAKE.near`; it falls to
// nothing at `BOOM_SHAKE.far`.
export function boomShakeAt(kind: BoomKind, distance: number): number {
  const span = Math.max(1, BOOM_SHAKE.far - BOOM_SHAKE.near);
  const k = Math.max(0, Math.min(1, (BOOM_SHAKE.far - distance) / span));
  return BOOM_DEFS[kind].shake * k * k;
}
