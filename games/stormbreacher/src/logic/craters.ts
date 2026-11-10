// The shell holes of #view-fx (SB-045): where the map's own holes go, from a seed, so the same seed gives the same
// battlefield. They are only a look: the ground stays flat for the mech (logic/mech.ts knows no heights). The holes keep
// clear of the map's props and targets and of the place the mech starts.
import { distXZ, type Rng } from '@engine/core/index.ts';
import { PROP_SIZE, TARGET_SIZE } from '../data/props.ts';
import type { FxTune } from '../data/tune.ts';
import type { MapDef, MapBounds, PropKind, TargetKind } from '../data/types.ts';

export interface Crater {
  x: number; // the middle on the ground (m)
  z: number;
  radius: number; // the hole's radius (m)
  water: boolean; // a hole with water in it
}

export const MECH_CLEAR = 10; // the ground kept clear around the mech's start (m)

const EDGE = 2; // the clear ground kept at the map's bounds (m)
const GAP = 1; // the clear ground kept around a prop or target (m)
const TRIES = 400; // how many places one hole may try

// The radius of a circle around a footprint: two such circles that stay apart prove the rectangles do not overlap.
function propRadius(kind: PropKind, scale: number): number {
  const size = PROP_SIZE[kind];
  return Math.hypot(size.w * scale, size.d * scale) / 2;
}

function targetRadius(kind: TargetKind): number {
  const size = TARGET_SIZE[kind];
  return Math.hypot(size.w, size.d) / 2;
}

// Whether a hole lies inside the map with the same edge kept as the first holes.
export function craterInsideBounds(crater: Pick<Crater, 'x' | 'z' | 'radius'>, bounds: MapBounds): boolean {
  return (
    crater.x - crater.radius >= bounds.minX + EDGE &&
    crater.x + crater.radius <= bounds.maxX - EDGE &&
    crater.z - crater.radius >= bounds.minZ + EDGE &&
    crater.z + crater.radius <= bounds.maxZ - EDGE
  );
}

// Puts a shell's hole on the list and drops the oldest ones once the list is past cap. Only the holes a shell added
// go in here; the map's first holes are a list of their own and are never dropped.
export function addShellCrater(list: Crater[], crater: Crater, cap: number): void {
  list.push(crater);
  const limit = Math.max(0, Math.floor(cap));
  while (list.length > limit) list.shift();
}

// Scatters tune.craters holes over the map. Gives back the ones that fit, which may be fewer when the map is crowded.
export function scatterCraters(rng: Rng, map: MapDef, tune: FxTune, start: { x: number; z: number }): Crater[] {
  const want = Math.max(0, Math.round(tune.craters));
  const low = Math.max(0.5, Math.min(tune.craterMin, tune.craterMax));
  const high = Math.max(low, tune.craterMax);
  const water = Math.max(0, Math.min(1, tune.craterWater));
  const blockers = map.props.filter(prop => prop.kind !== 'tile');
  const craters: Crater[] = [];

  function fits(x: number, z: number, radius: number): boolean {
    if (!craterInsideBounds({ x, z, radius }, map.bounds)) return false;
    if (distXZ({ x, z }, start) < MECH_CLEAR + radius) return false;
    if (blockers.some(prop => distXZ(prop, { x, z }) < propRadius(prop.kind, prop.scale) + radius + GAP)) {
      return false;
    }
    return !map.targets.some(target => distXZ(target, { x, z }) < targetRadius(target.kind) + radius + GAP);
  }

  for (let i = 0; i < want; i++) {
    for (let tryIndex = 0; tryIndex < TRIES; tryIndex++) {
      const radius = rng.rand(low, high);
      const x = rng.rand(map.bounds.minX + EDGE, map.bounds.maxX - EDGE);
      const z = rng.rand(map.bounds.minZ + EDGE, map.bounds.maxZ - EDGE);
      if (!fits(x, z, radius)) continue;
      craters.push({ x, z, radius, water: rng.next() < water });
      break;
    }
  }
  return craters;
}
