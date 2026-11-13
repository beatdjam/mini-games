// The charges planted on defence lines (SB-1500): holding use near a blast point plants one, its fuse burns down, and
// when it runs out the charge blows and hurts a mech that stayed inside the blast. Pure functions on small states;
// logic/game.ts keeps them and reports the events. They take narrow worlds rather than GameModel so game.ts can import
// this file without a cycle.
import { distXZ } from '@engine/core/index.ts';
import { CHARGE_TUNE } from '../data/charge.ts';
import type { BlastPlace } from '../data/types.ts';

// A charge on the ground: the point it was planted on and the fuse it has left.
export interface ChargeState {
  blast: string; // the BlastPlace id
  left: number; // seconds to the blast
}

// A hold under way: the point it is being planted on and how long the use key has been held.
export interface PlantState {
  blast: string; // the BlastPlace id
  hold: number; // seconds held so far
}

export interface ChargeWorld {
  blasts: readonly BlastPlace[];
  charges: ChargeState[];
  plant: PlantState | null;
  mech: { x: number; y: number; z: number; grounded: boolean };
}

export interface BlastWorld {
  charges: ChargeState[];
  blasts: readonly BlastPlace[];
  mech: { x: number; z: number };
}

// The nearest blast point within reach that has no charge on it, or null when there is none.
export function nearBlast(
  blasts: readonly BlastPlace[],
  charges: readonly ChargeState[],
  mech: { x: number; z: number },
): BlastPlace | null {
  let best: BlastPlace | null = null;
  let bestDist = CHARGE_TUNE.reach;
  for (const blast of blasts) {
    if (charges.some(charge => charge.blast === blast.id)) continue;
    const dist = distXZ(blast, mech);
    if (dist > bestDist) continue;
    best = blast;
    bestDist = dist;
  }
  return best;
}

// Counts a hold on by `dt` while use is held on the ground in reach of a point. A hold that reaches CHARGE_TUNE.holdSec
// puts a charge on the point and returns it as `planted`; any other frame keeps the hold in `plant`. Letting use go, going
// into the air or leaving reach drops the hold; being hit does not, so the caller has no damage input.
export function stepCharge(
  world: ChargeWorld,
  use: boolean,
  dt: number,
): { plant: PlantState | null; planted: BlastPlace | null } {
  const near =
    use && world.mech.grounded && world.mech.y === 0 ? nearBlast(world.blasts, world.charges, world.mech) : null;
  if (near === null) {
    world.plant = null;
    return { plant: null, planted: null };
  }
  const hold = world.plant !== null && world.plant.blast === near.id ? world.plant.hold + dt : dt;
  if (hold >= CHARGE_TUNE.holdSec) {
    world.charges.push({ blast: near.id, left: CHARGE_TUNE.fuse });
    world.plant = null;
    return { plant: null, planted: near };
  }
  world.plant = { blast: near.id, hold };
  return { plant: world.plant, planted: null };
}

// Counts every fuse down by `dt`, takes the burnt-out charges out of `charges` (in place) and returns their points, each
// with whether the mech's feet were inside the blast. The returned order is the order the charges were planted.
export function stepBlasts(world: BlastWorld, dt: number): { blast: BlastPlace; hit: boolean }[] {
  const blown: { blast: BlastPlace; hit: boolean }[] = [];
  for (const charge of world.charges) charge.left -= dt;
  for (let i = world.charges.length - 1; i >= 0; i--) {
    if (world.charges[i].left > 0) continue;
    const charge = world.charges[i];
    world.charges.splice(i, 1);
    const blast = world.blasts.find(place => place.id === charge.blast);
    if (!blast) continue;
    blown.unshift({ blast, hit: distXZ(blast, world.mech) <= CHARGE_TUNE.blastRadius });
  }
  return blown;
}
