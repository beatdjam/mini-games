// The third-person camera's position, as pure functions: the mech's target and the wall boxes go in, a camera pose
// comes out. Nothing here reads the scene or the camera; only applyPose writes to a camera.
// A candidate to move into the engine (D-23): it reads no game table, so every value comes in as an argument.
import * as THREE from 'three';
import { clamp } from '@engine/core/index.ts';
import type { CameraTune } from '../data/tuneTypes.ts';
import { rectBoxes, type GroundRect } from '../logic/collide.ts';
import type { Ray3 } from '../logic/fcs.ts';
import type { Aabb } from '../logic/fire.ts';

const WALL_HEIGHT = 100; // m; how high a rect with no top reaches, so the camera never goes over it

export interface CameraTarget {
  x: number; // the mech's feet on x (m)
  y: number; // the mech's feet on y (m)
  z: number; // the mech's feet on z (m)
  yaw: number; // 0 faces -z and grows turning left (rad)
}

export interface CameraPose {
  pos: THREE.Vector3; // where the camera goes
  look: THREE.Vector3; // the point it looks at
  dist: number; // the horizontal distance from look to pos (m)
  pulled: boolean; // a wall pulled the camera closer than dist
  shoulder: number; // how far the look point moved right (m)
}

interface Hit {
  point: THREE.Vector3;
  dist: number;
}

const FAN_SAMPLES = 3; // rays across a probe fan: the middle and one each side
const DEG = Math.PI / 180;

// The nearest box the ray meets, when that is no farther than `max` (m).
function nearestHit(origin: THREE.Vector3, dir: THREE.Vector3, max: number, boxes: readonly THREE.Box3[]): Hit | null {
  const ray = new THREE.Ray(origin, dir);
  const point = new THREE.Vector3();
  let best: Hit | null = null;
  for (const box of boxes) {
    if (!ray.intersectBox(box, point)) continue;
    const dist = origin.distanceTo(point);
    if (dist > max) continue;
    if (!best || dist < best.dist) best = { point: point.clone(), dist };
  }
  return best;
}

// The nearest hit across a fan of rays from `dir` to `probeDeg` either side of it. A corner's single edge then enters the
// test through the side rays, so the pull it causes grows with the angle instead of jumping when the middle ray crosses.
function nearestHitFan(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  max: number,
  boxes: readonly THREE.Box3[],
  probeDeg: number,
): Hit | null {
  if (probeDeg <= 0) return nearestHit(origin, dir, max, boxes);
  let best: Hit | null = null;
  const step = (2 * probeDeg * DEG) / (FAN_SAMPLES - 1);
  for (let i = 0; i < FAN_SAMPLES; i++) {
    const angle = -probeDeg * DEG + step * i;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const ray = new THREE.Vector3(dir.x * c + dir.z * s, dir.y, -dir.x * s + dir.z * c).normalize();
    const hit = nearestHit(origin, ray, max, boxes);
    if (hit && (!best || hit.dist < best.dist)) best = hit;
  }
  return best;
}

// The rects as boxes the camera keeps out of: each rect's box up to its top, or up to WALL_HEIGHT when it has no top.
// A ramp becomes a stack of boxes along its slope (rectBoxes), so the camera line meets the surface rather than the
// air over the low end. Every flat rect is still one box.
export function cameraBoxes(rects: readonly GroundRect[]): THREE.Box3[] {
  return rects.flatMap(cameraBoxesOfRect);
}

// The boxes one rect gives the camera; a ramp is a stack (see collide.ts's rectBoxes).
export function cameraBoxesOfRect(rect: GroundRect): THREE.Box3[] {
  return rectBoxes(rect).map(box => {
    const top = rect.top === undefined ? WALL_HEIGHT : box.maxY;
    return new THREE.Box3(new THREE.Vector3(box.minX, box.minY, box.minZ), new THREE.Vector3(box.maxX, top, box.maxZ));
  });
}

interface Placed {
  pos: THREE.Vector3; // where the camera goes with no lift
  dist: number; // the horizontal distance from the look point the wall left (m)
  pulled: boolean; // a wall pulled the camera closer than the desired place
}

// The camera's place for a look point: the desired position, pulled to a gap in front of the first wall between them.
function placedAt(
  look: THREE.Vector3,
  behind: THREE.Vector3,
  horizontal: number,
  up: number,
  tune: CameraTune,
  boxes: readonly THREE.Box3[],
  groundY: number,
): Placed {
  const desired = new THREE.Vector3(look.x + behind.x * horizontal, look.y + up, look.z + behind.z * horizontal);
  const offset = desired.clone().sub(look);
  const length = offset.length();
  let pos = desired;
  let dist = horizontal;
  let pulled = false;
  if (length > 1e-6) {
    const dir = offset.clone().divideScalar(length);
    const hit = nearestHitFan(look, dir, length, boxes, tune.probeDeg);
    if (hit) {
      pulled = true;
      const hitHorizontal = (hit.dist / length) * horizontal;
      const wanted = Math.max(tune.minDist, hitHorizontal - tune.margin);
      const scale = horizontal > 1e-6 ? wanted / horizontal : 0;
      pos = look.clone().addScaledVector(offset, scale);
      dist = wanted;
    }
  }
  // the ground is not one of the boxes: looking up drops the camera, so it stops a margin above the mech's feet
  pos.y = Math.max(pos.y, groundY + tune.margin);
  return { pos, dist, pulled };
}

// The point a mech's feet and yaw put the camera behind, with the walls kept out of the way.
export function cameraPose(
  target: CameraTarget,
  pitch: number,
  tune: CameraTune,
  boxes: readonly THREE.Box3[],
  aim = false,
): CameraPose {
  const head = new THREE.Vector3(target.x, target.y + tune.lookHeight, target.z);

  // the look point goes to the mech's right; a wall there shortens the shoulder
  const right = new THREE.Vector3(Math.cos(target.yaw), 0, -Math.sin(target.yaw));
  // Positive pitch looks up, so the camera drops below the look point; negative pitch lifts it.
  const pitchUsed = clamp(pitch, tune.pitchMin, tune.pitchMax);
  const baseDist = aim ? tune.aimDist : tune.dist;
  const horizontal = baseDist * Math.cos(pitchUsed);
  const up = tune.height - baseDist * Math.sin(pitchUsed);
  const behind = new THREE.Vector3(Math.sin(target.yaw), 0, Math.cos(target.yaw));

  let shoulder = tune.shoulder;
  if (shoulder > 0) {
    const hit = nearestHitFan(head, right, shoulder, boxes, tune.probeDeg);
    if (hit) shoulder = Math.max(0, hit.dist - tune.margin);
  }
  const look = head.clone().addScaledVector(right, shoulder);
  const placed = placedAt(look, behind, horizontal, up, tune, boxes, target.y);

  // A wall at minDist would put the lifted camera almost overhead, so the screen would be ground and shoulder. The look
  // point moves toward the mech's front by the pull, and the lift keeps the view no steeper than the open one plus
  // closePitch, so the wall-side camera still looks ahead over the shoulder.
  let dist = placed.dist;
  if (placed.pulled) {
    const closeness = 1 - clamp((placed.dist - tune.minDist) / Math.max(tune.riseRange, 1e-6), 0, 1);
    placed.pos.y += tune.rise * closeness;
    // the look point moves toward the mech's front, but stops a margin short of a wall the mech faces
    const forward = behind.clone().negate();
    let ahead = tune.closeLook * closeness;
    const aheadHit = nearestHit(look, forward, ahead, boxes);
    if (aheadHit) ahead = Math.max(0, aheadHit.dist - tune.margin);
    look.addScaledVector(forward, ahead);
    dist = placed.dist + ahead;
    const openDown = Math.atan2(up, Math.max(horizontal, 1e-6));
    const mostDown = clamp(openDown + tune.closePitch, -1.5, 1.5);
    const above = placed.pos.y - look.y;
    placed.pos.y = look.y + Math.min(above, dist * Math.tan(mostDown));
    placed.pos.y = Math.max(placed.pos.y, target.y + tune.margin);
  }

  return { pos: placed.pos, look, dist, pulled: placed.pulled, shoulder };
}

// The line through the middle of the screen: from where the camera sits to the point it looks at. No walls are given,
// so the line is the one the camera would have in the open.
export function aimRay(target: CameraTarget, pitch: number, tune: CameraTune): Ray3 {
  const pose = cameraPose(target, pitch, tune, []);
  return {
    ox: pose.pos.x,
    oy: pose.pos.y,
    oz: pose.pos.z,
    dx: pose.look.x - pose.pos.x,
    dy: pose.look.y - pose.pos.y,
    dz: pose.look.z - pose.pos.z,
  };
}

// `prev` moved toward `next` with the time constant `lag` (s); lag 0 goes straight to next. A new Vector3 comes back.
export function followPose(prev: THREE.Vector3, next: THREE.Vector3, dt: number, lag: number): THREE.Vector3 {
  if (lag <= 0) return next.clone();
  const amount = 1 - Math.exp(-dt / lag);
  return prev.clone().lerp(next, amount);
}

// The camera's place for this frame, followed from the last. A wall bringing the camera in is capped at `pullSpeed`, so
// a wall appearing at a corner slides the camera in rather than snapping it; a wall letting it go returns it at
// `returnSpeed`, slower than it came in. In the open the camera follows with `lag` as before.
export function followCamera(
  prev: THREE.Vector3 | null,
  pose: CameraPose,
  dt: number,
  tune: CameraTune,
): THREE.Vector3 {
  if (prev === null) return pose.pos.clone();
  const prevDist = Math.hypot(prev.x - pose.look.x, prev.z - pose.look.z);
  const inward = prevDist - pose.dist; // how much farther out the camera is than the pose wants (m)
  const outward = pose.dist - prevDist; // how much nearer it is (m)
  let lag = tune.lag;
  let speed = Infinity;
  const near = pose.pulled || prevDist < tune.dist - tune.pullNear;
  if (outward > tune.releaseGap) {
    // the wall let it go: come back out slowly
    lag = tune.returnLag;
    speed = tune.returnSpeed;
  } else if (near || inward > tune.pullGap) {
    // a wall is holding it in, or a corner is swinging its place: slide, do not jump
    speed = tune.pullSpeed;
  }
  const step = followPose(prev, pose.pos, dt, lag).sub(prev);
  const length = step.length();
  if (Number.isFinite(speed) && length > speed * dt) step.multiplyScalar((speed * dt) / length);
  return prev.clone().add(step);
}

// Puts a pose on the camera: position, look direction and field of view.
export function applyPose(cam: THREE.PerspectiveCamera, pose: CameraPose, fov: number) {
  cam.position.copy(pose.pos);
  cam.fov = fov;
  cam.updateProjectionMatrix();
  cam.lookAt(pose.look);
}

// How much of the screen's height the mech takes: its feet and its head projected, as a raw fraction (not clamped
// to 0..1).
export function screenFraction(cam: THREE.PerspectiveCamera, foot: THREE.Vector3, height: number): number {
  const bottom = new THREE.Vector3(foot.x, foot.y, foot.z).project(cam);
  const top = new THREE.Vector3(foot.x, foot.y + height, foot.z).project(cam);
  return Math.abs(top.y - bottom.y) / 2;
}

export interface ScreenRect {
  left: number; // px from the screen's left edge
  top: number; // px from the screen's top edge
  width: number; // px
  height: number; // px
}

// The rectangle round a box on a screen of width x height px: the box's eight corners projected by the camera, then
// the smallest rectangle that holds them, cut to the screen. null when a corner is behind the camera (the box is
// beside or round the camera, where a frame would mean nothing) or when the rectangle is wholly off the screen. The
// camera's matrices must be current (applyPose, then updateMatrixWorld, which the renderer does before a frame).
export function screenRect(box: Aabb, cam: THREE.Camera, width: number, height: number): ScreenRect | null {
  cam.updateMatrixWorld();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const corner = new THREE.Vector3();
  for (const x of [box.minX, box.maxX]) {
    for (const y of [box.minY, box.maxY]) {
      for (const z of [box.minZ, box.maxZ]) {
        corner.set(x, y, z);
        // the camera looks down -z in its own space, so a corner at z >= 0 there is behind it
        if (corner.clone().applyMatrix4(cam.matrixWorldInverse).z >= 0) return null;
        corner.project(cam);
        minX = Math.min(minX, corner.x);
        maxX = Math.max(maxX, corner.x);
        minY = Math.min(minY, corner.y);
        maxY = Math.max(maxY, corner.y);
      }
    }
  }
  // NDC runs -1..1 with y up
  if (maxX < -1 || minX > 1 || maxY < -1 || minY > 1) return null;
  const left = ((Math.max(minX, -1) + 1) / 2) * width;
  const right = ((Math.min(maxX, 1) + 1) / 2) * width;
  const top = ((1 - Math.min(maxY, 1)) / 2) * height;
  const bottom = ((1 - Math.max(minY, -1)) / 2) * height;
  return { left, top, width: right - left, height: bottom - top };
}
