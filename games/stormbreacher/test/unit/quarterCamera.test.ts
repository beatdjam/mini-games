import { expect, test } from 'vitest';
import * as THREE from 'three';
import { QUARTER_TUNE } from '../../src/data/tune.ts';
import {
  followQuarter,
  groundPoint,
  quarterPose,
  quarterTuneFrom,
  type QuarterPose,
} from '../../src/view/quarterCamera.ts';

const MECH = { x: 0, y: 0, z: 0 };

// The camera the view would draw from a pose.
function cameraOf(pose: QuarterPose): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(QUARTER_TUNE.fov, 16 / 9, 0.1, 1000);
  cam.position.copy(pose.pos);
  cam.lookAt(pose.look);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

const screenOf = (cam: THREE.PerspectiveCamera, x: number, y: number, z: number): THREE.Vector3 =>
  new THREE.Vector3(x, y, z).project(cam);

test('the screen shows inland up-right and +x right-down', () => {
  const cam = cameraOf(quarterPose(MECH, QUARTER_TUNE));
  const mech = screenOf(cam, MECH.x, MECH.y, MECH.z);
  // the way the mech faces at yaw 0 (-z, inland) is up and to the right of the mech
  const inland = screenOf(cam, MECH.x, MECH.y, MECH.z - 10);
  expect(inland.x).toBeGreaterThan(mech.x);
  expect(inland.y).toBeGreaterThan(mech.y);
  // the mech's right (+x) is right and below it, which fixes the 45 degree azimuth
  const right = screenOf(cam, MECH.x + 10, MECH.y, MECH.z);
  expect(right.x).toBeGreaterThan(mech.x);
  expect(right.y).toBeLessThan(mech.y);
});

test('quarterPose puts the look point and the camera where the tune asks', () => {
  const target = { x: 3, y: 2, z: -4 };
  const pose = quarterPose(target, QUARTER_TUNE);
  const upX = -Math.sin(QUARTER_TUNE.azimuth);
  const upZ = -Math.cos(QUARTER_TUNE.azimuth);
  // the look point leads the mech by `lead` toward the screen's top and sits `lookHeight` above its feet
  expect(pose.look.x).toBeCloseTo(target.x + upX * QUARTER_TUNE.lead, 9);
  expect(pose.look.y).toBeCloseTo(target.y + QUARTER_TUNE.lookHeight, 9);
  expect(pose.look.z).toBeCloseTo(target.z + upZ * QUARTER_TUNE.lead, 9);
  // the camera sits `height` above the look point and `back` toward the screen's bottom
  expect(pose.pos.y).toBeCloseTo(pose.look.y + QUARTER_TUNE.height, 9);
  expect(pose.pos.x).toBeCloseTo(pose.look.x - upX * QUARTER_TUNE.back, 9);
  expect(pose.pos.z).toBeCloseTo(pose.look.z - upZ * QUARTER_TUNE.back, 9);
});

test('followQuarter takes the pose whole with no previous frame', () => {
  const pose = quarterPose(MECH, QUARTER_TUNE);
  const next = followQuarter(null, pose, 1 / 60, QUARTER_TUNE);
  expect(next.pos.equals(pose.pos)).toBe(true);
  expect(next.look.equals(pose.look)).toBe(true);
  expect(next.pos).not.toBe(pose.pos);
  expect(next.look).not.toBe(pose.look);
});

test('followQuarter leaves exp(-1) of the step after one lag', () => {
  const prev: QuarterPose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const pose: QuarterPose = { pos: new THREE.Vector3(10, 20, 30), look: new THREE.Vector3(20, 30, 40) };
  const result = followQuarter(prev, pose, QUARTER_TUNE.lag, QUARTER_TUNE);
  const remaining = 1 - (result.pos.x - prev.pos.x) / (pose.pos.x - prev.pos.x);
  expect(remaining).toBeCloseTo(Math.exp(-1), 9);
  expect(pose.pos.x - result.pos.x).toBeCloseTo(10 * Math.exp(-1), 9);
  expect(pose.look.x - result.look.x).toBeCloseTo(20 * Math.exp(-1), 9);
});

test('followQuarter with lag 0 takes the pose whole', () => {
  const prev: QuarterPose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const pose = quarterPose(MECH, QUARTER_TUNE);
  const result = followQuarter(prev, pose, 1 / 60, { ...QUARTER_TUNE, lag: 0 });
  expect(result.pos.equals(pose.pos)).toBe(true);
  expect(result.look.equals(pose.look)).toBe(true);
  expect(result.pos).not.toBe(pose.pos);
});

test('followQuarter eases from a cutscene pose into the quarter pose', () => {
  // the landing's last key: the third-person pose behind the mech
  const from: QuarterPose = { pos: new THREE.Vector3(2.15, 6.2, 8.6), look: new THREE.Vector3(2.15, 4.7, 0) };
  const target = quarterPose(MECH, QUARTER_TUNE);
  const next = followQuarter(from, target, 1 / 60, QUARTER_TUNE);
  const moved = next.pos.distanceTo(from.pos);
  const whole = target.pos.distanceTo(from.pos);
  // the first controlled frame moves toward the quarter pose instead of jumping to it
  expect(moved).toBeGreaterThan(0);
  expect(moved).toBeLessThan(whole);
  expect(next.pos.distanceTo(target.pos)).toBeLessThan(whole);
});

test('the top cursor meets the plane at the mech feet within 0.1m', () => {
  const pose = quarterPose(MECH, QUARTER_TUNE);
  const cam = cameraOf(pose);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 1), cam);
  const hit = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -MECH.y);
  expect(ray.ray.intersectPlane(plane, hit)).not.toBeNull();
  const at = groundPoint(pose, QUARTER_TUNE.fov, 16 / 9, { x: 0, y: 1 }, MECH.y);
  expect(at).not.toBeNull();
  expect(Math.hypot(at!.x - hit.x, at!.z - hit.z)).toBeLessThan(0.1);
});

test('quarterTuneFrom overrides a value and ignores a bad one or an unknown name', () => {
  const tuned = quarterTuneFrom(new URLSearchParams('q.height=30'), QUARTER_TUNE);
  expect(tuned.height).toBe(30);
  expect(tuned.back).toBe(QUARTER_TUNE.back);
  expect(QUARTER_TUNE.height).toBe(25); // the table itself is not changed
  const ignored = quarterTuneFrom(new URLSearchParams('q.height=abc&q.unknown=1'), QUARTER_TUNE);
  expect(ignored).toEqual(QUARTER_TUNE);
});

test('quarterTuneFrom ignores values outside their range', () => {
  const ignored = quarterTuneFrom(new URLSearchParams('q.fov=0&q.height=-1&q.back=-2&q.lag=-3'), QUARTER_TUNE);
  expect(ignored).toEqual(QUARTER_TUNE);
  const wide = quarterTuneFrom(new URLSearchParams('q.fov=180'), QUARTER_TUNE);
  expect(wide).toEqual(QUARTER_TUNE);
  // the edges themselves are kept
  expect(quarterTuneFrom(new URLSearchParams('q.fov=1&q.height=0&q.back=0&q.lag=0'), QUARTER_TUNE)).toEqual({
    ...QUARTER_TUNE,
    fov: 1,
    height: 0,
    back: 0,
    lag: 0,
  });
});

test('groundPoint finds the look point under the middle of the screen', () => {
  const pose = quarterPose(MECH, QUARTER_TUNE);
  const at = groundPoint(pose, QUARTER_TUNE.fov, 16 / 9, { x: 0, y: 0 }, pose.look.y);
  expect(at).not.toBeNull();
  expect(Math.abs(at!.x - pose.look.x)).toBeLessThan(0.01);
  expect(Math.abs(at!.z - pose.look.z)).toBeLessThan(0.01);
});

test('the top of the screen is more inland than its middle', () => {
  const pose = quarterPose(MECH, QUARTER_TUNE);
  const middle = groundPoint(pose, QUARTER_TUNE.fov, 16 / 9, { x: 0, y: 0 }, pose.look.y)!;
  const top = groundPoint(pose, QUARTER_TUNE.fov, 16 / 9, { x: 0, y: 1 }, pose.look.y)!;
  // azimuth pi/4: the screen's top runs toward -x and -z, so the top point lies farther inland (smaller z)
  expect(top.z).toBeLessThan(middle.z);
  expect(top.x).toBeLessThan(middle.x);
});

test("the right of the screen finds a point to the mech's right", () => {
  const pose = quarterPose(MECH, QUARTER_TUNE);
  const middle = groundPoint(pose, QUARTER_TUNE.fov, 16 / 9, { x: 0, y: 0 }, pose.look.y)!;
  const right = groundPoint(pose, QUARTER_TUNE.fov, 16 / 9, { x: 1, y: 0 }, pose.look.y)!;
  // +x is the mech's right at yaw 0, and it is right and down the screen at azimuth pi/4
  expect(right.x).toBeGreaterThan(middle.x);
});

test('groundPoint gives null when the top of the screen looks above the horizon', () => {
  const pose = quarterPose(MECH, QUARTER_TUNE);
  // a wide enough fov lifts the top edge of the screen above level
  expect(groundPoint(pose, 150, 16 / 9, { x: 0, y: 1 }, 0)).toBeNull();
});
