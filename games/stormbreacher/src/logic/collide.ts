// The flat (XZ) collision of a circle with turned rects: how far a point is from a rect and how a circle is pushed out
// of one. A candidate to move into the engine (D-23): it reads no table, no MapDef and no mission, so every value comes
// in as an argument.
const PUSH_PASSES = 4; // how many times the rects are gone over when one push moves the circle into another

// A thing's footprint on the ground: its middle, half its width (x) and depth (z) before turning, and how far it is
// turned about its middle (rad, the same sense as three's rotation.y). `top` is the height of the thing's upper face
// (m); leaving it out means a wall with no top, which nothing can stand on or cross.
export interface GroundRect {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  yaw: number;
  top?: number;
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

// The height of the highest upper face the circle stands over: a rect whose top is at most `maxTop` and whose distance
// from the middle is under the radius; 0 when there is none (the ground).
export function groundAt(x: number, z: number, radius: number, rects: readonly GroundRect[], maxTop: number): number {
  let top = 0;
  for (const rect of rects) {
    const face = rect.top;
    if (face === undefined || face > maxTop || face <= top) continue;
    if (rectDistance(rect, x, z) < radius) top = face;
  }
  return top;
}

// Pushes a circle of `radius` out of every rect so its middle stands at least `radius` from each; gives back the new
// middle and the direction of each push, in the order they happened. A rect whose top is at or under `over` is not
// pushed against (`over` is the mech's height plus its step); leaving `over` out pushes against every rect.
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
      // a rect the circle can walk onto is no wall
      if (over !== undefined && rect.top !== undefined && rect.top <= over) continue;
      // a rect too far for the circle to reach can be left alone
      if (Math.hypot(px - rect.x, pz - rect.z) > radius + Math.hypot(rect.halfW, rect.halfD)) continue;
      const dx = px - rect.x;
      const dz = pz - rect.z;
      const cos = Math.cos(rect.yaw);
      const sin = Math.sin(rect.yaw);
      let localX = cos * dx - sin * dz;
      let localZ = sin * dx + cos * dz;
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
