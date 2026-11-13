// The flat (XZ) collision of a circle with turned rects: how far a point is from a rect and how a circle is pushed out
// of one. The box that wraps a rect is made here too. A candidate to move into the engine (D-23): it reads no table,
// no MapDef and no mission, so every value comes in as an argument.
import type { Aabb } from './fire.ts';

const PUSH_PASSES = 4; // how many times the rects are gone over when one push moves the circle into another

// A thing's footprint on the ground: its middle, half its width (x) and depth (z) before turning, and how far it is
// turned about its middle (rad, the same sense as three's rotation.y). `top` is the height of the thing's upper face
// (m); leaving it out means a wall with no top, which nothing can stand on or cross. `ramp` makes `top` the height at
// the -z edge, with the surface falling in a straight line to 0 at the +z edge, so the mech walks up it smoothly.
export interface GroundRect {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  yaw: number;
  top?: number;
  ramp?: boolean;
}

// The box a shot may hit, from a rect on the ground: the turned rect's outside wrapped along the axes, with y from the
// ground to its top. A turned rect's box grows a little, because fireRay only handles boxes along the axes. A ramp
// needs rectBoxes instead: one box this tall would hold the air over its low end.
export function rectBox(rect: GroundRect): Aabb {
  const cos = Math.abs(Math.cos(rect.yaw));
  const sin = Math.abs(Math.sin(rect.yaw));
  const halfX = cos * rect.halfW + sin * rect.halfD;
  const halfZ = sin * rect.halfW + cos * rect.halfD;
  return {
    minX: rect.x - halfX,
    maxX: rect.x + halfX,
    minY: 0,
    maxY: rect.top ?? 0,
    minZ: rect.z - halfZ,
    maxZ: rect.z + halfZ,
  };
}

// How high a step of a ramp's box stack may be (m). The boxes follow the slope in steps this small, so a shot or a
// camera line over the low end passes above the surface instead of meeting the air the one tall box would hold.
const RAMP_BOX_RISE = 0.25;

// The boxes a shot or a camera line may meet on a rect: one for a flat rect, and a stack along the climb for a ramp.
// Each ramp box runs from the ground up to the surface at its high edge, so the stack covers the wedge below the slope.
export function rectBoxes(rect: GroundRect): Aabb[] {
  if (rect.ramp !== true) return [rectBox(rect)];
  const top = rect.top ?? 0;
  const steps = Math.max(1, Math.ceil(top / RAMP_BOX_RISE));
  const cos = Math.cos(rect.yaw);
  const sin = Math.sin(rect.yaw);
  const boxes: Aabb[] = [];
  for (let i = 0; i < steps; i++) {
    // local z runs from +halfD at the low end to -halfD at the high end; this slice's high edge is z0
    const z0 = rect.halfD - ((i + 1) * 2 * rect.halfD) / steps;
    const z1 = rect.halfD - (i * 2 * rect.halfD) / steps;
    const maxY = (top * (rect.halfD - z0)) / (2 * rect.halfD);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const localX of [-rect.halfW, rect.halfW]) {
      for (const localZ of [z0, z1]) {
        const x = rect.x + cos * localX + sin * localZ;
        const z = rect.z - sin * localX + cos * localZ;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    }
    boxes.push({ minX, maxX, minY: 0, maxY, minZ, maxZ });
  }
  return boxes;
}

// The direction one push moved the circle (unit length).
interface CircleHit {
  nx: number;
  nz: number;
}

// The distance from a point to a rect on the ground; 0 inside it.
export function rectDistance(rect: GroundRect, x: number, z: number): number {
  const dx = x - rect.x;
  const dz = z - rect.z;
  const cos = Math.cos(rect.yaw);
  const sin = Math.sin(rect.yaw);
  const localX = cos * dx - sin * dz;
  const localZ = sin * dx + cos * dz;
  const outX = Math.max(Math.abs(localX) - rect.halfW, 0);
  const outZ = Math.max(Math.abs(localZ) - rect.halfD, 0);
  return Math.hypot(outX, outZ);
}

// The corners of a rect on the ground.
function cornersOf(rect: GroundRect): { x: number; z: number }[] {
  const cos = Math.cos(rect.yaw);
  const sin = Math.sin(rect.yaw);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => ({
    x: rect.x + cos * a * rect.halfW + sin * b * rect.halfD,
    z: rect.z - sin * a * rect.halfW + cos * b * rect.halfD,
  }));
}

// The shortest distance between two rects on the ground; 0 when they touch or overlap. Two convex shapes that do not
// overlap come closest at a corner of one of them, so the corners of each are measured against the other.
export function rectGap(a: GroundRect, b: GroundRect): number {
  let gap = Infinity;
  for (const corner of cornersOf(a)) gap = Math.min(gap, rectDistance(b, corner.x, corner.z));
  for (const corner of cornersOf(b)) gap = Math.min(gap, rectDistance(a, corner.x, corner.z));
  return gap;
}

// The height of a rect's upper face at (x, z): the flat `top` for most, or the slanted surface of a ramp, which runs
// from 0 at the +z edge to `top` at the -z edge (turned by the rect's yaw). A point outside the rect is measured at the
// nearest edge, so the side of a ramp is as tall as the surface there.
export function surfaceAt(rect: GroundRect, x: number, z: number): number {
  const top = rect.top ?? 0;
  if (rect.ramp !== true) return top;
  const dx = x - rect.x;
  const dz = z - rect.z;
  const localZ = Math.sin(rect.yaw) * dx + Math.cos(rect.yaw) * dz;
  const at = Math.min(Math.max(localZ, -rect.halfD), rect.halfD);
  return (top * (rect.halfD - at)) / (2 * rect.halfD);
}

// The height of the highest upper face the circle stands over: a rect whose face at (x, z) is at most `maxTop` and whose
// distance from the middle is under the radius; 0 when there is none (the ground). A ramp is read only where the middle
// stands on it (not within the radius): its seaward end is reached from the ground without a step, and its high end meets
// the seawall, whose top must not lift the circle off the slope that is actually under it.
export function groundAt(x: number, z: number, radius: number, rects: readonly GroundRect[], maxTop: number): number {
  let top = 0;
  let rampTop = -1;
  for (const rect of rects) {
    if (rect.top === undefined) continue;
    if (rect.ramp === true) {
      if (rectDistance(rect, x, z) !== 0) continue;
      const face = surfaceAt(rect, x, z);
      if (face > maxTop || face <= rampTop) continue;
      rampTop = face;
      continue;
    }
    if (rect.top > maxTop || rect.top <= top) continue;
    if (rectDistance(rect, x, z) < radius) top = rect.top;
  }
  return rampTop >= 0 ? rampTop : top;
}

// Whether the face the circle stands on at (x, z) is a ramp's surface: its middle lies on a ramp whose face is at most
// `maxTop` (the face groundAt picks). The mech follows a ramp's drop in one step; every other edge it walks off, it falls.
export function groundIsRamp(x: number, z: number, rects: readonly GroundRect[], maxTop: number): boolean {
  return rects.some(
    rect =>
      rect.ramp === true && rect.top !== undefined && rectDistance(rect, x, z) === 0 && surfaceAt(rect, x, z) <= maxTop,
  );
}

// Pushes a circle of `radius` out of every rect so its middle stands at least `radius` from each; gives back the new
// middle and the direction of each push, in the order they happened. A rect whose face at the circle's place is at or
// under `over` is not pushed against (`over` is the mech's height plus its step); leaving `over` out pushes against
// every rect. On a ramp the ends follow the face, but its sides stay walls at every height: while the circle is on
// the slope it is held inside the width, so it cannot walk off the side into the air.
export function pushOutCircle(
  x: number,
  z: number,
  radius: number,
  rects: readonly GroundRect[],
  over?: number,
): { x: number; z: number; hits: CircleHit[] } {
  let px = x;
  let pz = z;
  const hits: CircleHit[] = [];
  for (let pass = 0; pass < PUSH_PASSES; pass++) {
    let pushed = false;
    for (const rect of rects) {
      // a rect too far for the circle to reach can be left alone
      if (Math.hypot(px - rect.x, pz - rect.z) > radius + Math.hypot(rect.halfW, rect.halfD)) continue;
      const dx = px - rect.x;
      const dz = pz - rect.z;
      const cos = Math.cos(rect.yaw);
      const sin = Math.sin(rect.yaw);
      let localX = cos * dx - sin * dz;
      let localZ = sin * dx + cos * dz;
      const inside = Math.abs(localX) <= rect.halfW && Math.abs(localZ) <= rect.halfD;
      if (over !== undefined && rect.top !== undefined) {
        const face = surfaceAt(rect, px, pz);
        if (rect.ramp === true) {
          if (inside) {
            if (face <= over) {
              // on the slope: hold the circle's edge inside the sides; its low and high ends stay open
              const limit = Math.max(0, rect.halfW - radius);
              if (Math.abs(localX) > limit) {
                const sign = localX >= 0 ? 1 : -1;
                localX = sign * limit;
                px = rect.x + cos * localX + sin * localZ;
                pz = rect.z - sin * localX + cos * localZ;
                hits.push({ nx: -cos * sign, nz: sin * sign });
                pushed = true;
              }
              continue;
            }
          } else if (Math.abs(localX) > rect.halfW) {
            // off the slope and beside it: a side is a wall at any height, so do not skip the push
          } else if (face <= over) {
            continue;
          }
        } else if (face <= over) {
          // a flat rect whose face is within the step is no wall
          continue;
        }
      }
      let dirX: number;
      let dirZ: number;
      if (Math.abs(localX) > rect.halfW || Math.abs(localZ) > rect.halfD) {
        // outside: push away from the nearest point on the rect's edge
        const cx = Math.min(Math.max(localX, -rect.halfW), rect.halfW);
        const cz = Math.min(Math.max(localZ, -rect.halfD), rect.halfD);
        const ox = localX - cx;
        const oz = localZ - cz;
        const d = Math.hypot(ox, oz);
        if (d >= radius) continue;
        dirX = ox / d;
        dirZ = oz / d;
        localX = cx + dirX * radius;
        localZ = cz + dirZ * radius;
      } else {
        // inside: leave through the nearer of the x and z faces
        const depthX = rect.halfW - Math.abs(localX);
        const depthZ = rect.halfD - Math.abs(localZ);
        if (depthX < depthZ) {
          dirX = localX >= 0 ? 1 : -1;
          dirZ = 0;
          localX = dirX * (rect.halfW + radius);
        } else {
          dirX = 0;
          dirZ = localZ >= 0 ? 1 : -1;
          localZ = dirZ * (rect.halfD + radius);
        }
      }
      px = rect.x + cos * localX + sin * localZ;
      pz = rect.z - sin * localX + cos * localZ;
      hits.push({ nx: cos * dirX + sin * dirZ, nz: -sin * dirX + cos * dirZ });
      pushed = true;
    }
    if (!pushed) break;
  }
  return { x: px, z: pz, hits };
}
