import { setTileWorld, tileCenter, tileCoord } from './tiles.ts';
import { crossLink, otherEnd } from './floors.ts';
import type { FloorLink, FloorMover, FloorSpot, Floors } from './floors.ts';
// engine: Lifts that start by themselves: a rider who stands on one end of the lift's link for a moment is carried to
// the other end. Which links are lifts and who may ride is the game's (enemies that never ride simply are not passed).
// Also useFloor, which hands one floor's terrain to the module-level tile functions. No random numbers, no three.js.
// ---- tuning numbers (a game can pass its own through LiftConfig) ----
export const LIFT_WAIT = 0.8; // the rider stands on the lift this long before it starts (s)
export const LIFT_RIDE = 2.5; // the ride from one end to the other (s)

export interface LiftConfig {
  wait: number; // s, see LIFT_WAIT
  ride: number; // s, see LIFT_RIDE
}
export const LIFT_DEFAULTS: LiftConfig = { wait: LIFT_WAIT, ride: LIFT_RIDE };

export interface Lift {
  link: FloorLink; // one of the floors' links; its two ends are the lift's stops
  phase: 'idle' | 'wait' | 'ride'; // idle: nobody on it; wait: a rider stands on an end; ride: carrying the rider
  t: number; // seconds into the current phase (0 while idle)
  from: FloorSpot | null; // the end the rider got on at (null while idle)
}
export function createLift(link: FloorLink): Lift {
  return { link, phase: 'idle', t: 0, from: null };
}

// the end of the lift's link that `m` stands on, or null. A rider who has just come out there after a crossing
// (m.linkTile is that tile) is not on it yet: the lift does not carry it straight back. Once the rider is off that
// tile the hold is dropped (m.linkTile = -1), as crossLink does
function endUnder(f: Floors, lift: Lift, m: FloorMover): FloorSpot | null {
  const g = f.grids[m.floor];
  if (!g) return null;
  const i = tileCoord(m.x),
    j = tileCoord(m.z),
    k = g.inBounds(i, j) ? j * g.world.W + i : -1;
  if (m.linkTile !== undefined && m.linkTile >= 0) {
    if (m.linkTile === k) return null;
    m.linkTile = -1;
  }
  if (k < 0) return null;
  const { a, b } = lift.link;
  if (a.floor === m.floor && a.i === i && a.j === j) return a;
  if (b.floor === m.floor && b.i === i && b.j === j) return b;
  return null;
}

// Moves the lift on by dt seconds with `rider` (the one mover that may ride it, say the player).
// idle -> wait when the rider stands on either end; wait -> idle when it steps off before `wait` seconds, else ride;
// at the end of `ride` seconds the rider is moved to the other end (as crossLink does: floor, the middle of the tile,
// and a hold on that tile until it steps off) and the lift is idle again.
// Returns 'depart' on the update the ride starts, 'arrive' on the one the rider is moved, else null. While riding,
// keeping the rider still and showing the ride (liftProgress) is the game's; the lift does not look at the rider
export function updateLift(
  f: Floors,
  lift: Lift,
  rider: FloorMover,
  dt: number,
  cfg: Partial<LiftConfig> = {},
): 'depart' | 'arrive' | null {
  if (!(dt > 0)) return null;
  const { wait, ride } = { ...LIFT_DEFAULTS, ...cfg };
  if (lift.phase === 'ride') {
    lift.t += dt;
    if (lift.t < ride) return null;
    const from = lift.from!;
    // put the rider on the end it got on at, then cross from there (it may have been nudged off while riding)
    rider.floor = from.floor;
    rider.x = tileCenter(from.i);
    rider.z = tileCenter(from.j);
    rider.linkTile = -1;
    crossLink(f, rider, l => l === lift.link);
    lift.phase = 'idle';
    lift.t = 0;
    lift.from = null;
    return 'arrive';
  }
  const at = endUnder(f, lift, rider);
  if (!at) {
    lift.phase = 'idle';
    lift.t = 0;
    lift.from = null;
    return null;
  }
  if (lift.phase === 'idle') {
    lift.phase = 'wait';
    lift.t = 0;
    lift.from = at;
  }
  lift.t += dt;
  if (lift.t < wait) return null;
  lift.phase = 'ride';
  lift.t = 0;
  return 'depart';
}

// how far along the ride is: 0 at the start, 1 at the end; 0 when not riding
export function liftProgress(lift: Lift, cfg: Partial<LiftConfig> = {}): number {
  if (lift.phase !== 'ride') return 0;
  const { ride } = { ...LIFT_DEFAULTS, ...cfg };
  return Math.min(1, lift.t / ride);
}

// the end the lift is going to while it rides (null otherwise)
export function liftTarget(lift: Lift): FloorSpot | null {
  return lift.phase === 'ride' && lift.from ? otherEnd(lift.link, lift.from.floor, lift.from.i, lift.from.j) : null;
}

// Hands floor `floor`'s terrain to the module-level tile functions (setTileWorld with that floor's world, so its maps
// are shared, not copied: doors opened there stay open on that floor). Call it when the player changes floor.
// Throws when the floor does not exist
export function useFloor(f: Floors, floor: number) {
  const g = f.grids[floor];
  if (!g) throw new Error(`useFloor: floor ${floor} does not exist (${f.grids.length} floors)`);
  setTileWorld(g.world);
}
