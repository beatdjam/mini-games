// The camera near a wall (SB-1910): the mech stands with its back to a block or a seawall, side-on to one, or inside a
// corner, and the camera is followed for two seconds while the mech turns a full circle. The camera must slide rather
// than jump (no frame moves more than 0.2 m), and it must not cross the wall.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { CAMERA_TUNE, MECH_TUNE } from '../../src/data/tune.ts';
import {
  cameraBoxes,
  cameraPose,
  followCamera,
  type CameraPose,
  type CameraState,
  type CameraTarget,
} from '../../src/view/camera.ts';

const DT = 1 / 60;
const TURN_RATE = Math.PI; // rad/s, a full turn in two seconds
const SETTLE = 30; // frames the camera gets to reach its place before the turn starts
const MAX_JUMP = CAMERA_TUNE.pullSpeed * DT + 1e-6; // the most one frame may move the camera (m): the wall holds it to pullSpeed

interface Run {
  maxJump: number; // the largest move one frame makes (m)
  minChest: number; // the smallest distance from the camera to the chest (m)
  minHeight: number; // the lowest the camera gets above the feet (m)
  maxHeight: number;
  faded: number; // frames the camera was nearer the chest than fadeDist
  behind: number; // frames the camera was on the far side of a wall
}

// Turns the mech a full circle in place while the camera follows as the game does, and measures the run.
function turnRun(target: CameraTarget, boxes: readonly THREE.Box3[], tune = CAMERA_TUNE): Run {
  let state: CameraState | null = null;
  let prev: THREE.Vector3 | null = null;
  const chest = new THREE.Vector3(target.x, target.y + MECH_TUNE.chestHeight, target.z);
  const run: Run = { maxJump: 0, minChest: Infinity, minHeight: Infinity, maxHeight: -Infinity, faded: 0, behind: 0 };
  for (let frame = 0; frame < SETTLE + 120; frame++) {
    const yaw = target.yaw + (frame < SETTLE ? 0 : (frame - SETTLE) * DT * TURN_RATE);
    const pose = cameraPose({ ...target, yaw }, 0, tune, boxes);
    state = followCamera(state, pose, DT, tune);
    const pos = state.pos;
    if (prev) run.maxJump = Math.max(run.maxJump, pos.distanceTo(prev));
    prev = pos.clone();
    const chestDist = pos.distanceTo(chest);
    run.minChest = Math.min(run.minChest, chestDist);
    if (chestDist < MECH_TUNE.fadeDist) run.faded++;
    run.minHeight = Math.min(run.minHeight, pos.y - target.y);
    run.maxHeight = Math.max(run.maxHeight, pos.y - target.y);
    // beyond a wall: the line from the look point to the camera meets a box before the camera does
    const ray = new THREE.Ray(pose.look, pos.clone().sub(pose.look).normalize());
    const point = new THREE.Vector3();
    for (const b of boxes) {
      if (!ray.intersectBox(b, point)) continue;
      if (point.distanceTo(pose.look) < pos.distanceTo(pose.look) - 0.05) run.behind++;
    }
  }
  return run;
}

const at = (x: number, z: number, yaw = 0): CameraTarget => ({ x, y: 0, z, yaw });

function expectSmooth(run: Run): void {
  expect(run.maxJump).toBeLessThan(MAX_JUMP);
  expect(run.behind).toBe(0);
}

// A wall behind the mech (yaw 0 faces -z) whose near face is `dist` m from the mech's centre on +z.
const behind = (dist: number, top: number) => cameraBoxes([{ x: 0, z: dist + 2, halfW: 10, halfD: 2, yaw: 0, top }]);

test('a wall behind the mech at 0.5 to 3 m: the camera stays out of it and does not jump', () => {
  for (const dist of [0.5, 1, 2, 3]) expectSmooth(turnRun(at(0, 0), behind(dist, 4)));
  // the seawall is 6 m high, so the camera cannot go over it
  expectSmooth(turnRun(at(0, 0), behind(1, 6)));
});

test('a wall at the mech side at 0.5 to 3 m', () => {
  for (const dist of [0.5, 1, 2, 3]) {
    expectSmooth(turnRun(at(0, 0), cameraBoxes([{ x: dist + 2, z: 0, halfW: 2, halfD: 20, yaw: 0, top: 4 }])));
  }
});

test('a corner at 1 m', () => {
  const corner = (top: number): THREE.Box3[] =>
    cameraBoxes([
      { x: 0, z: 3, halfW: 10, halfD: 2, yaw: 0, top },
      { x: 3, z: 0, halfW: 2, halfD: 20, yaw: 0, top },
    ]);
  expectSmooth(turnRun(at(0, 0), corner(4)));
  expectSmooth(turnRun(at(0, 0), corner(6)));
});

test('at minDist the camera is lifted over the mech shoulder', () => {
  // the camera at 0.5 m and 1 m from the wall: the nearest is lifted by the full rise
  const near = turnRun(at(0, 0), behind(0.5, 4));
  const far = turnRun(at(0, 0), behind(3, 4));
  expect(near.maxHeight).toBeGreaterThan(near.minHeight);
  expect(near.minHeight).toBeGreaterThan(3.4);
  expect(far.minHeight).toBeLessThan(near.minHeight);
});

// The angle from the camera down to the look point (rad); a positive angle looks down.
function downAngle(pose: CameraPose): number {
  return Math.atan2(pose.pos.y - pose.look.y, Math.hypot(pose.pos.x - pose.look.x, pose.pos.z - pose.look.z));
}

test('at minDist the camera looks down no more than its open angle plus closePitch', () => {
  // a wall 1 m behind the mech holds the camera at minDist, where the lift used to tip the view at the ground
  const open = cameraPose(at(0, 0), 0, CAMERA_TUNE, []);
  const pulled = cameraPose(at(0, 0), 0, CAMERA_TUNE, behind(1, 4));
  expect(pulled.pulled).toBe(true);
  expect(pulled.dist).toBeCloseTo(CAMERA_TUNE.minDist + CAMERA_TUNE.closeLook, 6);
  expect(downAngle(pulled)).toBeLessThanOrEqual(downAngle(open) + CAMERA_TUNE.closePitch + 1e-6);
});
