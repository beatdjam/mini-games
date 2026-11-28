// The allied mech of the mission script (SB-170, 仮): the ones that run beside the player's mech and fall on the way.
// The ways they run and the places they fall at are in the mission (data/missions/m1.ts); the colours and the parts are
// in colors.ts and mechProto.ts.
import type { AllyFateBy } from './types.ts';

export const ALLY_TUNE = {
  speed: 9, // how fast it runs along its way (m/s)
  // SB-2044: an ally with no fate that has fallen behind the player's mech runs faster until it is back with it. Behind
  // means on the sea side of the mech by more than catchGap; the speed rises from speed to speed x catchMul over catchRamp.
  catchGap: 40, // it starts to hurry when it is this far from the mech and behind it (m)
  catchRamp: 20, // and runs at the full catchMul this much farther out (m)
  catchMul: 2, // how many times `speed` it runs at the full catch-up
  arrive: 1.5, // it counts as at a place this near (m)
  height: 3.4, // its height (m); the player's mech is MECH_TUNE.height
  fireEvery: 0.35, // seconds between two of its tracers (s)
  fireHeight: 2.2, // the height a tracer leaves from above the feet (m)
  fireAhead: 1.6, // how far ahead of the feet a tracer starts (m)
  tracerSpeed: 80, // how fast the tracer flies (m/s)
  tracerSpread: 6, // how far a tracer's aim is scattered sideways and up when no enemy is near (m/s of its velocity)
  engageRange: 70, // how far an ally looks for an enemy to shoot at (m)
  aimSpreadDeg: 1.5, // how far an ally's tracer is scattered around its aim (deg)
  enemyTracerEvery: 2.5, // seconds between one enemy's tracers at an ally (s)
  enemyTracerRange: 80, // how far an enemy looks for an ally to shoot at (m)
  enemyTracerSpreadDeg: 2, // how far an enemy's tracer is scattered around its aim (deg)
  wreckTilt: 1.35, // how far the wreck lies over (rad)
  callLead: 4, // it calls on the radio this many seconds before its fate's place (s)
  groundRadius: 0.5, // the radius of its feet handed to groundAt (m)
  maxGround: 6.5, // the highest ground it may step up onto (m); the seawall is 6 m
  fallSpeed: 20, // how fast it drops when the ground below it is lower (m/s)
};

// The ways an ally may fall (`fate.by` of the script's `ally` action).
export const ALLY_FATES: readonly AllyFateBy[] = ['mortar', 'gun', 'shell'];

// The allies' two types (SB-2082), the three views' sniper and scout. Each mech gets one, so a squad reads as a mix of
// a long rifle and a radar rather than five of one machine. The numbers are provisional.
export const ALLY_KIT_IDS = ['sniper', 'scout'] as const;
export type AllyKit = (typeof ALLY_KIT_IDS)[number];
export const ALLY_KITS: Record<string, AllyKit> = {
  buddy: 'scout',
  'cover-b1': 'sniper',
  'cover-b2': 'sniper',
  'cover-b3': 'scout',
  gunner: 'sniper',
};

// The type a mech wears. An ally the mission has not named takes the sniper's, so a new one still builds.
export function allyKitOf(id: string): AllyKit {
  return ALLY_KITS[id] ?? 'sniper';
}

// The allies' fire that tells (SB-2301, 仮): each standing ally shoots the nearest enemy the infantry's support fire would
// pick, within its kit's range, at its kit's pace, and a hit takes a share of the enemy's health and suppresses it the
// way an infantry shot does. A sniper reaches far, fires slowly and hits hard; a scout is short-ranged and light. The
// tracer's look follows the shot: the sniper's is faster and drawn as a thicker line (more parallel tracers), the scout's
// is the one the allies showed before. The values are provisional.
export interface AllyFireTune {
  range: number; // how far the kit's shot reaches (m)
  every: number; // seconds between two of its shots (s)
  share: number; // the share of the target's full health one shot takes (0-1)
  tracerSpeed: number; // how fast the tracer flies (m/s)
  tracerLines: number; // how many parallel tracers a shot draws; 2 reads as thicker (lines)
  tracerGap: number; // how far the parallel tracers stand apart (m)
}

export const ALLY_FIRE_TUNE: Record<AllyKit, AllyFireTune> = {
  sniper: { range: 85, every: 2.4, share: 0.35, tracerSpeed: 150, tracerLines: 2, tracerGap: 0.14 },
  scout: { range: 55, every: 0.8, share: 0.08, tracerSpeed: 80, tracerLines: 1, tracerGap: 0 },
};

export type AllyShape = 'run' | 'wreck';

// The allies' support fire made visible (SB-2024). While a `suppress` window runs, tracers fly at the silenced nests
// from the nearest ally, or from out at sea when none is in range, with a spark and dust where they land; a puff of
// smoke sits over each silenced nest. Only a look: the nests' quiet is the `suppress` action's own seconds. The values
// are provisional.
export const COVER_TUNE = {
  fireEvery: 0.1, // seconds between one tracer and the next, taken nest by nest in turn (s)
  allyRange: 110, // an ally within this many metres of the nest fires from where it stands (m)
  seaDist: 70, // otherwise the tracer comes from this far seaward (+z) of the nest (m)
  seaLanes: 3, // the sea tracers come from this many places across: left, middle and right of the nest
  seaSpread: 25, // and from this far to either side (m)
  fromHeight: 2.2, // the height a tracer leaves from over the ground (m)
  hitHeight: 0.6, // the fraction of the nest's height a tracer lands at (0-1)
  speed: 150, // how fast the tracer flies (m/s)
  smokeSize: 1.9, // the smoke over a silenced nest (m)
  smokeLift: 2.6, // how far above the nest's feet the smoke floats (m)
  warnBefore: 2, // the radio line that the rounds run short comes this many seconds before the window ends (s)
  endLine: 'm1.line2-ammo', // its language key
  endCallout: 'm1.callout.line2-ammo', // the short order near the aim that goes with it (SB-2028)
};
