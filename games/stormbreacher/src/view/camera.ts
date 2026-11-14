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
  openDist: number; // the horizontal distance the pose wants with no wall (m)
  pulled: boolean; // a wall pulled the camera closer than dist
  shoulder: number; // how far the look point moved right (m)
  openLook: THREE.Vector3; // where the look point would be with no walls
  feet: { x: number; z: number }; // the mech's feet on the ground (m), for the step it took this frame
  yaw: number; // the mech's own facing (rad), so a step backward is known from a strafe
  boxes: readonly THREE.Box3[]; // the wall boxes the pose was made with, so the mech's step can be stopped at one
}

// What the screen used last frame: the place the camera was put, the point it looked at, the look point with no walls
// (the wall's share is measured from it), the mech's feet and facing (for the step it took and how fast it turned). The
// view keeps it between frames, so the mech's motion follows with `lag` and only a wall's push eases.
export interface CameraState {
  pos: THREE.Vector3; // the camera's place on the screen
  look: THREE.Vector3; // the point the screen looks at
  openLook: THREE.Vector3; // the look point with no walls (see CameraPose.openLook)
  feet: { x: number; z: number }; // the mech's feet last frame (m)
  yaw: number; // the mech's facing last frame (rad), so a fast turn is known from a stalled wall return
  held: boolean; // a wall pulled the camera in last frame, or the hold carried while it came back out
}

interface Hit {
  point: THREE.Vector3;
  dist: number;
}

const FAN_SAMPLES = 3; // rays across a probe fan: the middle and one each side
const DEG = Math.PI / 180;
const CLOSE_PITCH_MAX = 1.5; // rad; the steepest the wall-side camera may look down past its open angle
const FAST_TURN = 8; // rad/s; past this the lag cuts the corner enough that a wall's hold drags a turn (SB-1949)

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

  // The look point with no walls: the share a wall adds or takes away is measured from it, so the view can keep the
  // mech's own motion exact and ease only the wall's shoulder and close look.
  const openLook = head.clone().addScaledVector(right, tune.shoulder);

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
    const mostDown = clamp(openDown + tune.closePitch, -CLOSE_PITCH_MAX, CLOSE_PITCH_MAX);
    const above = placed.pos.y - look.y;
    placed.pos.y = look.y + Math.min(above, dist * Math.tan(mostDown));
    placed.pos.y = Math.max(placed.pos.y, target.y + tune.margin);
  }

  return {
    pos: placed.pos,
    look,
    dist,
    openDist: horizontal,
    pulled: placed.pulled,
    shoulder,
    openLook,
    feet: { x: target.x, z: target.z },
    yaw: target.yaw,
    boxes,
  };
}

// A pose as a camera state: a camera already in its place, with no ease behind it.
export function stateOfPose(pose: CameraPose): CameraState {
  return {
    pos: pose.pos.clone(),
    look: pose.look.clone(),
    openLook: pose.openLook.clone(),
    feet: { x: pose.feet.x, z: pose.feet.z },
    yaw: pose.yaw,
    held: pose.pulled,
  };
}

// The line through the middle of the screen: from where the camera was put to the point it looked at. Taking the state
// the view drew means a wall's shoulder, close look and close pitch all move the aim with the screen.
export function aimRay(state: CameraState): Ray3 {
  return {
    ox: state.pos.x,
    oy: state.pos.y,
    oz: state.pos.z,
    dx: state.look.x - state.pos.x,
    dy: state.look.y - state.pos.y,
    dz: state.look.z - state.pos.z,
  };
}

// `prev` moved toward `next` with the time constant `lag` (s); lag 0 goes straight to next. A new Vector3 comes back.
export function followPose(prev: THREE.Vector3, next: THREE.Vector3, dt: number, lag: number): THREE.Vector3 {
  if (lag <= 0) return next.clone();
  const amount = 1 - Math.exp(-dt / lag);
  return prev.clone().lerp(next, amount);
}

// The wall's share of the look point's move, followed from the last frame. The mech's own motion is added outside this,
// so the aim stays on the mech; only the shoulder's shortening and `closeLook` ease here. Pulling in changes it at most
// `pullSpeed`; a wall that has let go (the share shrinks by more than `releaseGap` while it is longer than `pullNear`)
// comes back at `returnSpeed`, eased by `returnLag`, and the last `pullGap` closes at the pull speed.
function followWallOffset(
  prevOffset: THREE.Vector3,
  poseOffset: THREE.Vector3,
  dt: number,
  tune: CameraTune,
): THREE.Vector3 {
  const prevLength = prevOffset.length();
  const poseLength = poseOffset.length();
  const near = prevLength > tune.pullNear;
  const remaining = poseOffset.distanceTo(prevOffset);
  const returning = near && prevLength - poseLength > tune.releaseGap && remaining > tune.pullGap;
  const step = (returning ? followPose(prevOffset, poseOffset, dt, tune.returnLag) : poseOffset.clone()).sub(
    prevOffset,
  );
  const limit = (returning ? tune.returnSpeed : tune.pullSpeed) * dt;
  const length = step.length();
  if (length > limit) step.multiplyScalar(limit / length);
  return prevOffset.clone().add(step);
}

// A step, cut short a margin before the first wall the camera would meet on its way: the camera may be carried by the
// mech or pulled by a wall's share, but not into a wall. A camera already inside a box is left alone, so a wall behind
// it does not jump it out.
function stepRoom(
  prevPos: THREE.Vector3,
  travel: THREE.Vector3,
  boxes: readonly THREE.Box3[],
  tune: CameraTune,
): THREE.Vector3 {
  const length = travel.length();
  if (length <= 1e-6 || boxes.some(box => box.containsPoint(prevPos))) return travel;
  const hit = nearestHit(prevPos, travel.clone().divideScalar(length), length + tune.margin, boxes);
  if (!hit) return travel;
  return travel.clone().multiplyScalar(Math.max(0, hit.dist - tune.margin) / length);
}

// The camera for this frame. The look point keeps the mech's own motion exact (a boost must not leave the aim behind)
// and eases only the wall's shoulder and close look. The place follows the pose with `lag`, and with no wall that is all
// it does. While a wall pulls the camera or holds it nearer than its open place, only the part of the move beyond the
// mech's own step is held to `pullSpeed`, so the mech's motion is followed exactly and the wall's share slides. Both the
// mech's step and the wall's share stop a margin before a wall, so neither can carry the camera into it.
export function followCamera(prev: CameraState | null, pose: CameraPose, dt: number, tune: CameraTune): CameraState {
  if (prev === null) return stateOfPose(pose);
  const travel = new THREE.Vector3(pose.feet.x - prev.feet.x, 0, pose.feet.z - prev.feet.z);

  const prevOffset = prev.look.clone().sub(prev.openLook);
  const lookOffset = followWallOffset(prevOffset, pose.look.clone().sub(pose.openLook), dt, tune);
  const look = pose.openLook.clone().add(lookOffset);

  // A wall holds the camera closer than its open place: the step it takes is measured without the mech's own travel,
  // so a boost is not mistaken for the wall's push and the camera never lags into the mech. A wall that has let go is
  // known by the share it had on the look (its shoulder and close look), so a mech backing up with no wall keeps `lag`.
  // A fast turn in the open also brings the camera nearer the look point (the lag cuts the corner), so `near` counts
  // only while a wall pulled the camera in or held it last frame; an open turn then takes the `lag` step exactly.
  const prevDist = Math.hypot(prev.pos.x - pose.look.x, prev.pos.z - pose.look.z);
  const near = prevDist < pose.openDist - tune.pullNear;
  const returning = near && prevOffset.length() > tune.pullNear && pose.dist - prevDist > tune.releaseGap;
  // A wall's return moves the camera out from the look point over many frames. A fast turn also leaves the camera
  // behind, while the wall's return is nearly done, and holding its speed there would drag the camera through the turn
  // (SB-1949, SB-1951). So the hold carries while the camera is still well inside its open place or the wall's share is
  // coming back, and ends on a fast turn once the camera is within releaseGap of its open place: that nearer place is
  // then the turn cutting the corner, not a wall pushing it.
  const turn = Math.abs(Math.atan2(Math.sin(pose.yaw - prev.yaw), Math.cos(pose.yaw - prev.yaw)));
  const wallReturn = returning || pose.dist - prevDist > tune.releaseGap;
  const held = pose.pulled || (near && prev.held && (wallReturn || turn < FAST_TURN * dt));
  const step = followPose(prev.pos, pose.pos, dt, returning ? tune.returnLag : tune.lag).sub(prev.pos);
  if (held) {
    const rel = step.clone().sub(travel);
    const limit = (returning ? tune.returnSpeed : tune.pullSpeed) * dt;
    const length = rel.length();
    if (length > limit) rel.multiplyScalar(limit / length);
    // The wall's share can turn the camera toward another wall too (a wall that has just come between the look and the
    // camera, say), so it stops a margin before one as the mech's own step does (SB-1951).
    const moved = stepRoom(prev.pos, travel, pose.boxes, tune);
    step.copy(moved).add(stepRoom(prev.pos.clone().add(moved), rel, pose.boxes, tune));
  }

  return {
    pos: prev.pos.clone().add(step),
    look,
    openLook: pose.openLook.clone(),
    feet: { x: pose.feet.x, z: pose.feet.z },
    yaw: pose.yaw,
    held,
  };
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
