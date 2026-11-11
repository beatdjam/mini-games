// The planes overhead in #view-fx (SB-045): pure functions over a plane's place on the map. They fly across the map's
// own coordinates, with no link to the mech. Pure so a node test can run them, and no three.
import type { Rng } from '@engine/core/index.ts';
import type { MapBounds } from '../data/types.ts';

// How far past the map's left and right edges a plane turns round (m). The lane is the bounds' width plus both sides:
// M1's B (200 m wide) gives 320 m, the same reach as the old 160 m span's round trip.
export const PLANE_MARGIN = 60;

// How much a plane's height is scattered: the height is planeHeight +- this (m).
export const PLANE_LIFT = 12;

export interface Plane {
  x: number;
  z: number;
  lift: number;
  dir: number; // +1 crosses toward +x, -1 toward -x
}

// Puts a plane somewhere along its lane, at any depth. The draws are x, z, lift, dir.
export function newPlane(rng: Rng, bounds: MapBounds): Plane {
  return {
    x: rng.rand(bounds.minX - PLANE_MARGIN, bounds.maxX + PLANE_MARGIN),
    z: rng.rand(bounds.minZ, bounds.maxZ),
    lift: rng.rand(-PLANE_LIFT, PLANE_LIFT),
    dir: rng.next() < 0.5 ? -1 : 1,
  };
}

// Moves a plane one frame. Once it leaves the lane it turns round at the far side, with a new depth and height. The
// mech's place is not an argument: the planes fly with no link to it.
export function stepPlane(plane: Plane, rng: Rng, bounds: MapBounds, speed: number, dt: number): void {
  plane.x += plane.dir * speed * dt;
  const low = bounds.minX - PLANE_MARGIN;
  const high = bounds.maxX + PLANE_MARGIN;
  if (plane.x < low || plane.x > high) {
    plane.dir = -plane.dir;
    plane.x = plane.dir > 0 ? low : high;
    plane.z = rng.rand(bounds.minZ, bounds.maxZ);
    plane.lift = rng.rand(-PLANE_LIFT, PLANE_LIFT);
  }
}
