// The mech's melee blow: a short lunge and a sector in front of it. It uses no ammo, so the mech can still fight once
// both guns are empty (2026-11-13). Every value is provisional and gets tuned from #view-map's panel.
import type { EnemyKind } from './enemies.ts';
import type { TargetKind } from './types.ts';

// Every kind the fist can hit. A walking machine and a structure take different shares of the blow, and the share falls
// as the thing gets heavier: a fist should answer infantry, not break a bunker as fast as a rifle does.
export type MeleeKind = EnemyKind | TargetKind | 'mine' | 'prop';

// The share of MELEE_TUNE.damage each kind takes (provisional). A pillbox takes none: a blow only suppresses it, as a shot
// does (SB-2015).
export const MELEE_DAMAGE_MUL: Record<MeleeKind, number> = {
  // the walking machines: an assault and a grunt fall to one blow, a heavy to five
  assault: 1,
  grunt: 1,
  heavy: 0.6,
  // the machine-gun nest is a structure, but its gun and crew are open, so it is not as hard as a pillbox
  emplacement: 0.375,
  // the mid boss (SB-1850) is a heavy machine: a fist barely scratches it, so its fight stays with the guns
  warden: 0.0625,
  // the objectives: a pillbox takes no health from a blow (only a charge breaks it), the guns of the battery barely feel a fist
  pillbox: 0,
  depot: 0.15625,
  gun: 0.0625,
  // the fortress's nest sits on the wall's top (12 m), but the fist measures its reach along the ground, so a mech at the
  // wall's foot can still hit it; it takes the same share as the battery's guns (provisional)
  fortressGun: 0.0625,
  magazine: 0.09375,
  // the other things a shot breaks: a mine is small and a breakable prop is a wall of hedgehogs or a wreck
  mine: 0.625,
  prop: 0.15625,
};

export const MELEE_TUNE = {
  damage: 40, // what one blow takes off a walking enemy (assault 20: 1, grunt 40: 1, heavy 120 with its share: 5)
  range: 6, // how far the sector reaches (m)
  halfArcDeg: 40, // half the sector's width, so +-40 degrees from the front
  interval: 0.8, // the seconds between one blow and the next
  windupSec: 0.12, // how long the arm draws back before the swing (s)
  swingSec: 0.2, // how long the swing through takes (s)
  returnSec: 0.18, // how long the arm takes to come back after the swing (s)
  hitShare: 0.45, // where in the swing the blow lands (0 is the start of the swing, 1 its end)
  lungeSec: 0.25, // how long the lunge takes (s)
  lungeDistance: 5, // how far a blow that meets something lunges (m)
  missDistance: 1.5, // the shorter lunge of a blow that meets nothing (m)
  hitStop: 0.08, // the freeze a hit asks the feel for (s)
  hitShake: 0.35, // the camera's shake a hit adds (m)
  contactGap: 0.05, // how far in front of a face the blow's point stands, so its sparks are not lost inside it (m)
  sparkCount: 8, // the sparks a hit throws
  sparkSpeed: 5, // how fast a spark flies out (m/s)
  sparkLife: 0.18, // how long a spark lives (s)
  sparkGravity: -4, // how fast a spark falls (m/s^2)
} as const;

// When the blow lands, in seconds from the key: the windup, then the share of the swing. logic and view read this one
// number (as a function, so #view-map's panel can retime the blow), so the damage and the arm cannot drift apart.
export const meleeHitSec = (): number => MELEE_TUNE.windupSec + MELEE_TUNE.swingSec * MELEE_TUNE.hitShare;

// When the blow is over: the swing, then the arm's return. The game keeps the blow this long so the view can finish it.
export const meleeBlowSec = (): number => MELEE_TUNE.windupSec + MELEE_TUNE.swingSec + MELEE_TUNE.returnSec;
