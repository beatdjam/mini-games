// The charges planted on defence lines (SB-1500): holding use near a blast point plants one, its fuse burns down, and
// when it runs out the charge blows and hurts a mech that stayed inside the blast. The blast also opens a hole in the
// line: the hedgehogs in a rectangle about the point (SB-1510). Pure functions on small states; logic/game.ts keeps them
// and reports the events. They take narrow worlds rather than GameModel so game.ts can import this file without a cycle.
import { distXZ } from '@engine/core/index.ts';
import { CHARGE_TUNE } from '../data/charge.ts';
import type { MapDef } from '../data/types.ts';

// A blast point and whether its charge has already blown the line open.
export interface BlastState {
  id: string;
  line: number | null; // the line's centre z; null for a point that belongs to no line
  x: number;
  z: number;
  blasted: boolean;
}

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

// Where a point's target lives and how much health it has left. The game passes itself; a caller that leaves these out
// (the unit tests on their small points) gets every point as live.
export interface BlastTargetWorld {
  map?: MapDef;
  targets?: readonly { id: string; hp: number }[];
}

export interface ChargeWorld extends BlastTargetWorld {
  blasts: readonly BlastState[];
  charges: ChargeState[];
  plant: PlantState | null;
  mech: { x: number; y: number; z: number; grounded: boolean };
}

export interface BlastWorld {
  charges: ChargeState[];
  blasts: readonly BlastState[];
  mech: { x: number; z: number };
}

// The id of the target a point breaks (a pillbox's point), or undefined for a point on a line.
export function blastTarget(map: MapDef, id: string): string | undefined {
  return map.blasts?.find(place => place.id === id)?.target;
}

// Whether the target a point names still stands. A point that names no target, or a world without the map, counts as
// live. The draw uses it too, so the ring on the ground and the point the game lets a charge be planted on agree.
export function targetStands(blast: BlastState, world: BlastTargetWorld): boolean {
  if (world.map === undefined) return true;
  const target = blastTarget(world.map, blast.id);
  if (target === undefined) return true;
  return (world.targets?.find(entry => entry.id === target)?.hp ?? 0) > 0;
}

// The map's blast points as the game keeps them, none of them blown yet.
export function newBlasts(map: MapDef): BlastState[] {
  return (map.blasts ?? []).map(place => ({ id: place.id, line: place.line, x: place.x, z: place.z, blasted: false }));
}

// The place in map.props of every hedgehog a blast at `blast` opens out of the line: the rectangle of half width
// CHARGE_TUNE.holeHalfWidth about the point's x and half depth CHARGE_TUNE.holeHalfDepth about the line's centre z. A point
// that belongs to no line opens no hedgehog. The walking check (mapCheck.ts) and the game both call this, so the shape
// they use is the same one.
export function blastPropIndexes(map: MapDef, blast: { x: number; line: number | null }): number[] {
  const line = blast.line;
  if (line === null) return [];
  const indexes: number[] = [];
  map.props.forEach((prop, index) => {
    if (prop.kind !== 'hedgehog') return;
    if (Math.abs(prop.x - blast.x) > CHARGE_TUNE.holeHalfWidth) return;
    if (Math.abs(prop.z - line) > CHARGE_TUNE.holeHalfDepth) return;
    indexes.push(index);
  });
  return indexes;
}

// A copy of the map with the holes of the named blast points opened: for the tests and the dev view, so they see the
// line as the game draws it after a blast. The game itself takes the props out of its own arrays instead; `blasts` stays
// on the copy, so a point that is already open can still be named.
export function openBreach(map: MapDef, ids: readonly string[]): MapDef {
  const named = new Set(ids);
  const removed = new Set<number>();
  for (const blast of map.blasts ?? []) {
    if (!named.has(blast.id)) continue;
    for (const index of blastPropIndexes(map, blast)) removed.add(index);
  }
  return { ...map, props: map.props.filter((_prop, index) => !removed.has(index)) };
}

// The nearest blast point within reach that has no charge on it and has not blown yet, and whose target (a pillbox) still
// stands, or null when there is none.
export function nearBlast(
  blasts: readonly BlastState[],
  charges: readonly ChargeState[],
  mech: { x: number; z: number },
  world: BlastTargetWorld = {},
): BlastState | null {
  let best: BlastState | null = null;
  let bestDist = CHARGE_TUNE.reach;
  for (const blast of blasts) {
    if (blast.blasted) continue;
    if (charges.some(charge => charge.blast === blast.id)) continue;
    if (!targetStands(blast, world)) continue;
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
): { plant: PlantState | null; planted: BlastState | null } {
  const near =
    use && world.mech.grounded && world.mech.y === 0 ? nearBlast(world.blasts, world.charges, world.mech, world) : null;
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
export function stepBlasts(world: BlastWorld, dt: number): { blast: BlastState; hit: boolean }[] {
  const blown: { blast: BlastState; hit: boolean }[] = [];
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
