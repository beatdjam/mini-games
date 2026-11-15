// The camera near walls follows the mech's facing at once (SB-2050): a wall slows the camera's distance from the look
// point, not the direction it sits in. Walls that push and let go again and again do not send it out and back.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { CAMERA_TUNE } from '../../src/data/tune.ts';
import { cameraBoxes, cameraPose, followCamera, type CameraState, type CameraTarget } from '../../src/view/camera.ts';

const DT = 1 / 60;
const SETTLE = 90; // frames the camera gets to reach its place
const SECONDS = 0.3; // the time the camera has to come round behind a mech that turned
const QUARTER = Math.PI / 2;
const LEFT_OUT = 1.5; // slack on what the time constant leaves of the turn, for the frame steps

const at = (x: number, z: number, yaw = 0): CameraTarget => ({ x, y: 0, z, yaw });

// The angle between where the camera sits round the point it looks at and the mech's back (rad, 0 to PI).
function offBack(state: CameraState, target: CameraTarget): number {
  const sat = Math.atan2(state.pos.x - state.look.x, state.pos.z - state.look.z);
  const back = Math.atan2(Math.sin(target.yaw), Math.cos(target.yaw));
  return Math.abs(Math.atan2(Math.sin(sat - back), Math.cos(sat - back)));
}

// How far the camera is from the point it looks at, on the ground (m).
const awayFrom = (state: CameraState): number => Math.hypot(state.pos.x - state.look.x, state.pos.z - state.look.z);

function follow(targets: readonly CameraTarget[], boxes: readonly THREE.Box3[], tune = CAMERA_TUNE): CameraState[] {
  const states: CameraState[] = [];
  let state: CameraState | null = null;
  for (const target of targets) {
    state = followCamera(state, cameraPose(target, 0, tune, boxes), DT, tune);
    states.push(state);
  }
  return states;
}

// A wall 1 m behind the mech (yaw 0 faces -z, so its back is +z), 20 m long.
const wallBehind = (): THREE.Box3[] => cameraBoxes([{ x: 0, z: 2, halfW: 10, halfD: 1, yaw: 0, top: 6 }]);

test('with its back to a wall, a mech that turns 90 degrees has the camera round behind it within 0.3 s', () => {
  const settle = Array.from({ length: SETTLE }, () => at(0, 0, 0));
  const turned = Array.from({ length: Math.ceil(SECONDS / DT) + 1 }, () => at(0, 0, QUARTER));
  const states = follow([...settle, ...turned], wallBehind());
  const last = states.length - 1;
  // the swing closes the gap with turnLag, so after SECONDS what is left of the quarter turn is exp(-SECONDS / turnLag)
  const left = QUARTER * Math.exp(-SECONDS / CAMERA_TUNE.turnLag) * LEFT_OUT;
  expect(offBack(states[SETTLE - 1], at(0, 0, 0))).toBeLessThan(0.1); // it was behind the mech before the turn
  expect(offBack(states[last], turned[0])).toBeLessThan(left);
});

// The mech walks +x with its back to +z; two blocks stand 1 m behind it with a 3 m gap, which it crosses in 0.4 s (less than
// returnDelay), so the wall pushes, lets go and pushes again. Returns the worst angle off the mech's back (rad) and how far
// the camera's distance from the look point changed while the mech was between the blocks (m).
function walkPastTwoBlocks(tune = CAMERA_TUNE): { worst: number; spread: number } {
  const boxes = cameraBoxes([
    { x: 5, z: 2, halfW: 2, halfD: 1, yaw: 0, top: 6 },
    { x: 12, z: 2, halfW: 2, halfD: 1, yaw: 0, top: 6 },
  ]);
  const speed = 7.5;
  const targets = [
    ...Array.from({ length: SETTLE }, () => at(0, 0)),
    ...Array.from({ length: 200 }, (_, frame) => at(speed * frame * DT, 0)),
  ];
  const states = follow(targets, boxes, tune);
  let worst = 0;
  const gap: number[] = [];
  for (const [frame, state] of states.entries()) {
    if (frame < SETTLE) continue;
    worst = Math.max(worst, offBack(state, targets[frame]));
    const x = targets[frame].x;
    if (x > 8.5 && x < 8.5 + 0.2 * speed) gap.push(awayFrom(state));
  }
  return { worst, spread: Math.max(...gap) - Math.min(...gap) };
}

test('walking past two blocks with a short gap between them, the camera keeps behind the mech', () => {
  expect(walkPastTwoBlocks().worst).toBeLessThan(0.15); // 9 degrees; the slow return left it 14 degrees off
});

test('walking past two blocks with a short gap between them, the camera stays near instead of going out and back', () => {
  expect(walkPastTwoBlocks().spread).toBeLessThan(0.1);
  expect(walkPastTwoBlocks({ ...CAMERA_TUNE, returnDelay: 0 }).spread, 'with no wait it goes out').toBeGreaterThan(0.3);
});

test('a wall that lets go keeps the camera near for returnDelay, then it comes back out', () => {
  const settle = Array.from({ length: SETTLE }, () => at(0, 0));
  const after = Array.from({ length: 120 }, () => at(0, 0));
  const walled = [...settle.map(() => wallBehind()), ...after.map((): THREE.Box3[] => [])];
  let state: CameraState | null = null;
  const away: number[] = [];
  for (const [frame, boxes] of walled.entries()) {
    const target = frame < SETTLE ? settle[frame] : after[frame - SETTLE];
    state = followCamera(state, cameraPose(target, 0, CAMERA_TUNE, boxes), DT, CAMERA_TUNE);
    away.push(awayFrom(state));
  }
  const near = away[SETTLE - 1];
  const wait = Math.floor(CAMERA_TUNE.returnDelay / DT) - 2;
  expect(Math.max(...away.slice(SETTLE, SETTLE + wait))).toBeLessThan(near + 0.05);
  expect(away[away.length - 1]).toBeGreaterThan(near + 2);
});
