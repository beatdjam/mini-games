import { expect, test } from 'vitest';
import * as THREE from 'three';
import { CAMERA_TUNE } from '../../src/data/tune.ts';
import { cameraPose, followPose, type CameraTarget } from '../../src/view/camera.ts';

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
