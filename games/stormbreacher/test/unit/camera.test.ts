import { expect, test } from 'vitest';
import * as THREE from 'three';
import { CAMERA_TUNE } from '../../src/data/tune.ts';
import { cameraBoxes, cameraPose, followPose, screenRect, type CameraTarget } from '../../src/view/camera.ts';

const at = (x = 0, z = 0, yaw = 0): CameraTarget => ({ x, y: 0, z, yaw });

const box = (min: [number, number, number], max: [number, number, number]): THREE.Box3 =>
  new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));

test('with no walls the camera sits behind the mech at the tuned distance', () => {
  const pose = cameraPose(at(), 0, CAMERA_TUNE, []);
  expect(pose.dist).toBe(CAMERA_TUNE.dist);
  expect(pose.pulled).toBe(false);
  expect(pose.pos.z).toBeGreaterThan(0); // yaw 0 faces -z, so behind is +z
  expect(pose.pos.z).toBeCloseTo(CAMERA_TUNE.dist, 9);
});

test('a wall behind the mech pulls the camera in front of it', () => {
  const wall = box([-50, 0, 8], [50, 20, 9]);
  const pose = cameraPose(at(), 0, CAMERA_TUNE, [wall]);
  expect(pose.pulled).toBe(true);
  expect(pose.pos.z).toBeLessThanOrEqual(8 - CAMERA_TUNE.margin + 1e-6);
  expect(wall.containsPoint(pose.pos)).toBe(false);
});

test('a wall closer than minDist does not bring the camera nearer than minDist', () => {
  const wall = box([-50, 0, 2], [50, 20, 3]);
  const tune = { ...CAMERA_TUNE, minDist: 4 };
  const pose = cameraPose(at(), 0, tune, [wall]);
  expect(pose.pulled).toBe(true);
  expect(pose.dist).toBeGreaterThanOrEqual(tune.minDist);
});

test('with the default minDist, a wall 2 m behind keeps the camera on this side of it', () => {
  const wall = box([-50, 0, 2], [50, 20, 3]);
  const pose = cameraPose(at(), 0, CAMERA_TUNE, [wall]);
  expect(pose.pulled).toBe(true);
  expect(pose.pos.z).toBeLessThan(2);
  expect(wall.containsPoint(pose.pos)).toBe(false);
});

test('a wall on the right shortens the shoulder and keeps the look point out of it', () => {
  const wall = box([2, 0, -50], [3, 20, 50]);
  const pose = cameraPose(at(), 0, CAMERA_TUNE, [wall]);
  expect(pose.shoulder).toBeLessThan(CAMERA_TUNE.shoulder);
  expect(wall.containsPoint(pose.look)).toBe(false);
});

test('pitch stops at pitchMax', () => {
  // a low cap keeps the camera above the ground, so the height shows where the pitch stopped
  const tune = { ...CAMERA_TUNE, pitchMax: 0.2 };
  const posed = cameraPose(at(), 2, tune, []);
  const capped = cameraPose(at(), tune.pitchMax, tune, []);
  expect(posed.pos.y).toBeCloseTo(capped.pos.y, 9);
  expect(posed.pos.y).toBeCloseTo(tune.lookHeight + tune.height - tune.dist * Math.sin(tune.pitchMax), 6);
});

test('looking up does not put the camera under the ground', () => {
  const pose = cameraPose(at(), CAMERA_TUNE.pitchMax, CAMERA_TUNE, []);
  expect(pose.pos.y).toBeGreaterThanOrEqual(CAMERA_TUNE.margin);
});

test('followPose goes straight to next with no lag and partway with a lag', () => {
  const prev = new THREE.Vector3(0, 0, 0);
  const next = new THREE.Vector3(10, 0, 0);
  const straight = followPose(prev, next, 0.016, 0);
  expect(straight.toArray()).toEqual(next.toArray());
  const partway = followPose(prev, next, 0.016, 0.12);
  expect(partway.x).toBeGreaterThan(0);
  expect(partway.x).toBeLessThan(10);
  expect(prev.x).toBe(0); // neither input is changed
  expect(next.x).toBe(10);
});

test('aiming uses the aiming distance', () => {
  const pose = cameraPose(at(), 0, CAMERA_TUNE, [], true);
  expect(pose.dist).toBeCloseTo(CAMERA_TUNE.aimDist, 9);
  expect(pose.pos.z).toBeCloseTo(CAMERA_TUNE.aimDist, 9);
});

test('cameraBoxes turns rects into boxes up to their tops', () => {
  const boxes = cameraBoxes([
    { x: 0, z: 0, halfW: 2, halfD: 1, yaw: 0, top: 3 },
    { x: 0, z: 0, halfW: 2, halfD: 1, yaw: 0 },
  ]);
  expect(boxes[0].min.toArray()).toEqual([-2, 0, -1]);
  expect(boxes[0].max.toArray()).toEqual([2, 3, 1]);
  expect(boxes[1].min.y).toBe(0);
  expect(boxes[1].max.y).toBe(100);
});

test('a box behind the mech pulls the camera in front of it', () => {
  const boxes = cameraBoxes([{ x: 0, z: 3, halfW: 5, halfD: 0.5, yaw: 0, top: 6 }]);
  const pose = cameraPose(at(), 0, CAMERA_TUNE, boxes);
  expect(pose.pulled).toBe(true);
  expect(pose.pos.z).toBeLessThan(2.5);
});

test('a low box behind the mech leaves the camera where it was', () => {
  const low = cameraBoxes([{ x: 0, z: 3, halfW: 5, halfD: 0.5, yaw: 0, top: 0.5 }]);
  const pose = cameraPose(at(), 0, CAMERA_TUNE, low);
  const open = cameraPose(at(), 0, CAMERA_TUNE, []);
  expect(pose.pulled).toBe(false);
  expect(pose.pos.toArray()).toEqual(open.pos.toArray());
});

// A camera at the origin looking down -z, on a 1000x500 screen (aspect 2, vertical fov 60).
function lookingDownZ(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(60, 2, 0.1, 1000);
  cam.updateMatrixWorld();
  return cam;
}

const aabb = (minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number) => ({
  minX,
  maxX,
  minY,
  maxY,
  minZ,
  maxZ,
});

test('a box in front of the camera gets a rectangle round it', () => {
  const rect = screenRect(aabb(-2, 2, -2, 2, -21, -19), lookingDownZ(), 1000, 500);
  if (!rect) throw new Error('the box is in view');
  expect(rect.left + rect.width / 2).toBeCloseTo(500, 6);
  expect(rect.top + rect.height / 2).toBeCloseTo(250, 6);
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);
  expect(rect.width).toBeCloseTo(rect.height, 6); // a square of metres is a square of pixels
});

test('a box to the right lands on the right half of the screen', () => {
  const rect = screenRect(aabb(8, 10, -1, 1, -21, -19), lookingDownZ(), 1000, 500);
  if (!rect) throw new Error('the box is in view');
  expect(rect.left).toBeGreaterThan(500);
});

test('a box behind the camera has no rectangle', () => {
  expect(screenRect(aabb(-2, 2, -2, 2, 19, 21), lookingDownZ(), 1000, 500)).toBeNull();
});

test('a box with a corner behind the camera has no rectangle', () => {
  expect(screenRect(aabb(-2, 2, -2, 2, -10, 10), lookingDownZ(), 1000, 500)).toBeNull();
});

test('a box off the screen has no rectangle', () => {
  expect(screenRect(aabb(200, 202, -1, 1, -21, -19), lookingDownZ(), 1000, 500)).toBeNull();
});

test('a box that runs off the screen is cut to the screen', () => {
  const rect = screenRect(aabb(5, 200, -1, 1, -21, -19), lookingDownZ(), 1000, 500);
  if (!rect) throw new Error('the box is in view');
  expect(rect.left + rect.width).toBeCloseTo(1000, 6);
});
