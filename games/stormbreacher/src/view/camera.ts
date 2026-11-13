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
  let shoulder = tune.shoulder;
  if (shoulder > 0) {
    const hit = nearestHit(head, right, shoulder, boxes);
    if (hit) shoulder = Math.max(0, hit.dist - tune.margin);
  }
  const look = head.clone().addScaledVector(right, shoulder);

  // Positive pitch looks up, so the camera drops below the look point; negative pitch lifts it.
  const pitchUsed = clamp(pitch, tune.pitchMin, tune.pitchMax);
  const baseDist = aim ? tune.aimDist : tune.dist;
  const horizontal = baseDist * Math.cos(pitchUsed);
  const up = tune.height - baseDist * Math.sin(pitchUsed);
  const behind = new THREE.Vector3(Math.sin(target.yaw), 0, Math.cos(target.yaw));
  const desired = new THREE.Vector3(look.x + behind.x * horizontal, look.y + up, look.z + behind.z * horizontal);

  // A wall between the look point and the desired position pulls the camera to a gap in front of it.
  const offset = desired.clone().sub(look);
  const length = offset.length();
  let pos = desired;
  let dist = horizontal;
  let pulled = false;
  if (length > 1e-6) {
    const dir = offset.clone().divideScalar(length);
    const hit = nearestHit(look, dir, length, boxes);
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
  pos.y = Math.max(pos.y, target.y + tune.margin);

  return { pos, look, dist, pulled, shoulder };
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
