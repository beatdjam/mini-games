// The ground the overview camera shows, as pure math (SB-2230): the mech's feet, the camera's tune and the screen's
// aspect go in, the four corners of the ground on the screen come out. view/quarterCamera.ts makes the same pose and ray
// with three; this is the copy a node test can run, so three and the DOM are not imported here.
import type { QuarterTune } from '../data/tuneTypes.ts';

export interface GroundPoint2 {
  x: number;
  z: number;
}

// The four corners of the ground on the screen, in convex order.
export type Quad = GroundPoint2[];

// How far from the camera a corner that looks above the horizon is put (m).
const FAR_LIMIT = 400;

interface Pose {
  pos: { x: number; y: number; z: number };
  look: { x: number; y: number; z: number };
}

interface Ray {
  x: number;
  y: number;
  z: number;
}

// The camera's pose for a mech at `feet`, as view/quarterCamera.ts' quarterPose has it.
function poseOf(feet: { x: number; y: number; z: number }, tune: QuarterTune): Pose {
  const upX = -Math.sin(tune.azimuth);
  const upZ = -Math.cos(tune.azimuth);
  const look = {
    x: feet.x + upX * tune.lead,
    y: feet.y + tune.lookHeight,
    z: feet.z + upZ * tune.lead,
  };
  const pos = {
    x: look.x - upX * tune.back,
    y: look.y + tune.height,
    z: look.z - upZ * tune.back,
  };
  return { pos, look };
}

// The ray from the camera through the screen point (`ndc`, -1 to 1 with + up), as view/quarterCamera.ts' groundPoint
// builds it.
function rayOf(pose: Pose, tune: QuarterTune, aspect: number, ndc: { x: number; y: number }): Ray {
  let fx = pose.look.x - pose.pos.x;
  let fy = pose.look.y - pose.pos.y;
  let fz = pose.look.z - pose.pos.z;
  const flen = Math.hypot(fx, fy, fz);
  fx /= flen;
  fy /= flen;
  fz /= flen;
  let rx = -fz;
  let rz = fx;
  const rlen = Math.hypot(rx, rz);
  rx /= rlen;
  rz /= rlen;
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const tan = Math.tan((tune.fov * Math.PI) / 360);
  return {
    x: fx + ndc.x * aspect * tan * rx + ndc.y * tan * ux,
    y: fy + ndc.y * tan * uy,
    z: fz + ndc.x * aspect * tan * rz + ndc.y * tan * uz,
  };
}

// Where `ray` meets the horizontal plane at `y`, or null when it does not come down to it.
function groundOn(pose: Pose, ray: Ray, y: number): GroundPoint2 | null {
  if (ray.y >= -1e-9) return null;
  const t = (y - pose.pos.y) / ray.y;
  if (!(t > 0)) return null;
  return { x: pose.pos.x + ray.x * t, z: pose.pos.z + ray.z * t };
}

// The signed area of the quad on the ground, twice over: positive when its corners run counterclockwise in x and z.
function areaOf(quad: Quad): number {
  let area = 0;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % quad.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area;
}

// `quad` with each side moved `margin` outward (the corners are the meeting points of the moved sides), which keeps the
// test at the true distance from the sides rather than an approximation from the corners.
function grow(quad: Quad, margin: number): Quad {
  const ccw = areaOf(quad) >= 0;
  const sides = quad.map((a, i) => {
    const b = quad[(i + 1) % quad.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ez) || 1;
    // outward normal: (ez, -ex) for a counterclockwise quad, the other way for a clockwise one
    const nx = (ez / len) * (ccw ? 1 : -1);
    const nz = (-ex / len) * (ccw ? 1 : -1);
    return { nx, nz, c: nx * a.x + nz * a.z + margin };
  });
  return quad.map((point, i) => {
    const a = sides[(i - 1 + quad.length) % quad.length];
    const b = sides[i];
    const det = a.nx * b.nz - a.nz * b.nx;
    // sides that are nearly parallel (a sliver) only need their own corner moved
    if (Math.abs(det) < 1e-9) return { x: point.x + a.nx * margin, z: point.z + a.nz * margin };
    return {
      x: (a.c * b.nz - a.nz * b.c) / det,
      z: (a.nx * b.c - a.c * b.nx) / det,
    };
  });
}

// The ground on the screen, as the four corners of the trapezoid the overview camera's view cuts from the plane at the
// mech's feet, grown `margin` outward. A corner above the horizon is put `FAR_LIMIT` from the camera along its way.
export function viewGround(
  feet: { x: number; y: number; z: number },
  tune: QuarterTune,
  aspect: number,
  margin: number,
): Quad {
  const pose = poseOf(feet, tune);
  const quad = [
    { x: -1, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: -1 },
  ].map(ndc => {
    const ray = rayOf(pose, tune, aspect, ndc);
    const hit = groundOn(pose, ray, feet.y);
    if (hit !== null) return hit;
    // above the horizon: take the far point along the ray's way over the ground
    const flat = Math.hypot(ray.x, ray.z);
    if (flat < 1e-9) return { x: feet.x, z: feet.z };
    return {
      x: pose.pos.x + (ray.x / flat) * FAR_LIMIT,
      z: pose.pos.z + (ray.z / flat) * FAR_LIMIT,
    };
  });
  return margin > 0 ? grow(quad, margin) : quad;
}

// Whether the point is inside the convex quad, its sides counting as inside.
export function insideQuad(quad: Quad, x: number, z: number): boolean {
  const ccw = areaOf(quad) >= 0;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % quad.length];
    const cross = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
    if (ccw ? cross < 0 : cross > 0) return false;
  }
  return true;
}
