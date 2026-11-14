// The allied mech of the mission script (SB-170, 仮): the ones that run beside the player's mech and fall on the way.
// The ways they run and the places they fall at are in the mission (data/missions/m1.ts); the colours are in colors.ts.
import type { AllyFateBy } from './types.ts';

export const ALLY_TUNE = {
  speed: 9, // how fast it runs along its way (m/s)
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
export const ALLY_FATES: readonly AllyFateBy[] = ['mortar', 'gun'];
