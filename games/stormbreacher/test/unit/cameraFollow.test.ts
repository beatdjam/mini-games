// The camera's state across frames (SB-1935): the mech's own motion follows with the open lag, a wall or a turn eases
// the camera, and the aim is the middle of the screen the state drew.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { CAMERA_TUNE, MECH_TUNE } from '../../src/data/tune.ts';
import {
  aimRay,
  applyPose,
  cameraBoxes,
  cameraPose,
  followCamera,
  followPose,
  stateOfPose,
  type CameraState,
  type CameraTarget,
} from '../../src/view/camera.ts';

const DT = 1 / 60;
const DEG = 180 / Math.PI;
const BOOST = 15; // m/s
const SECONDS = 2; // the boost's length
const WITHIN = 1.5; // how much farther than the open lag the camera may fall behind
const MAX_FRAME_MOVE = 0.2; // m
const MAX_FRAME_TURN = 5; // deg

const at = (x: number, z: number, yaw = 0): CameraTarget => ({ x, y: 0, z, yaw });

// The camera followed frame by frame for `frames`, with the mech put at each frame's target.
function followFrames(targets: readonly CameraTarget[], boxes: readonly THREE.Box3[]): CameraState[] {
  const states: CameraState[] = [];
  let state: CameraState | null = null;
  for (const target of targets) {
    state = followCamera(state, cameraPose(target, 0, CAMERA_TUNE, boxes), DT, CAMERA_TUNE);
    states.push(state);
  }
  return states;
}

// The same targets with the open lag alone: the camera the master would keep with no wall and no speed cap.
function openFrames(targets: readonly CameraTarget[]): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  let pos: THREE.Vector3 | null = null;
  for (const target of targets) {
    const pose = cameraPose(target, 0, CAMERA_TUNE, []);
    pos = pos === null ? pose.pos.clone() : followPose(pos, pose.pos, DT, CAMERA_TUNE.lag);
    out.push(pos.clone());
  }
  return out;
}

test('a boost in the open stays within 1.5 times the open lag, forward and backward', () => {
  for (const direction of [1, -1]) {
    const targets = Array.from({ length: Math.round(SECONDS / DT) }, (_, frame) =>
      at(0, direction * BOOST * frame * DT),
    );
    const states = followFrames(targets, []);
    const open = openFrames(targets);
    const mech = (frame: number) => new THREE.Vector3(0, 0, direction * BOOST * frame * DT);
    const own = Math.max(...states.map((state, frame) => state.pos.distanceTo(mech(frame))));
    const reference = Math.max(...open.map((pos, frame) => pos.distanceTo(mech(frame))));
    expect(own).toBeLessThanOrEqual(reference * WITHIN);
    // backing up must not walk the camera into the mech and make it see-through
    const chest = states.map((state, frame) =>
      state.pos.distanceTo(new THREE.Vector3(0, MECH_TUNE.chestHeight, direction * BOOST * frame * DT)),
    );
    expect(Math.min(...chest)).toBeGreaterThan(MECH_TUNE.fadeDist);
  }
});

// The wall behind the mech at 1 m, 20 m long: the mech walks +x past its end while the camera follows.
const wallBehind = (): THREE.Box3[] => cameraBoxes([{ x: 0, z: 2, halfW: 10, halfD: 1, yaw: 0, top: 6 }]);

// The direction from the camera to the point it looks at, normalized.
const view = (state: CameraState): THREE.Vector3 => state.look.clone().sub(state.pos).normalize();

for (const speed of [7.5, BOOST]) {
  test(`walking past a wall's end at ${speed} m/s: no jump and no sudden turn`, () => {
    const boxes = wallBehind();
    // let the camera settle beside the wall first
    const settle = Array.from({ length: 30 }, () => at(0, 0));
    const run = Array.from({ length: 240 }, (_, frame) => at(speed * frame * DT, 0));
    const states = followFrames([...settle, ...run], boxes).slice(settle.length);
    let maxMove = 0;
    let maxTurn = 0;
    for (let i = 0; i < states.length; i++) {
      const prevPos = i === 0 ? states[0].pos : states[i - 1].pos;
      const prevView = i === 0 ? view(states[0]) : view(states[i - 1]);
      maxMove = Math.max(maxMove, states[i].pos.distanceTo(prevPos));
      maxTurn = Math.max(maxTurn, Math.acos(Math.min(1, Math.max(-1, view(states[i]).dot(prevView)))) * DEG);
    }
    expect(maxMove).toBeLessThanOrEqual(MAX_FRAME_MOVE);
    expect(maxTurn).toBeLessThanOrEqual(MAX_FRAME_TURN);
  });
}

// The camera applyPose leaves for a state.
function cameraOf(pose: ReturnType<typeof cameraPose>, state: CameraState): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 1000);
  applyPose(cam, { ...pose, pos: state.pos, look: state.look }, CAMERA_TUNE.fov);
  return cam;
}

test('the aim line is the middle of the screen with no wall, a wall behind and a wall to the right', () => {
  const cases: Array<[string, THREE.Box3[]]> = [
    ['no wall', []],
    ['a wall 1 m behind', cameraBoxes([{ x: 0, z: 3, halfW: 3, halfD: 2, yaw: 0, top: 4 }])],
    ['a wall 1 m to the right', cameraBoxes([{ x: 4, z: 0, halfW: 3, halfD: 20, yaw: 0, top: 4 }])],
  ];
  for (const [name, boxes] of cases) {
    const target = at(0, 0);
    const pose = cameraPose(target, 0, CAMERA_TUNE, boxes);
    const states = followFrames(
      Array.from({ length: 120 }, () => target),
      boxes,
    );
    const state = states[states.length - 1];
    const aim = aimRay(state);
    const dir = new THREE.Vector3(aim.dx, aim.dy, aim.dz).normalize();
    const cam = cameraOf(pose, state);
    const forward = new THREE.Vector3();
    cam.getWorldDirection(forward);
    expect(Math.acos(Math.min(1, Math.max(-1, forward.dot(dir)))) * DEG, name).toBeLessThanOrEqual(0.01);
    // A point on the aim line, 10 m out, lands in the middle of the camera's screen. The right wall shifts the line
    // sideways while keeping its direction, so the angle alone does not see it.
    const out = new THREE.Vector3(aim.ox, aim.oy, aim.oz).addScaledVector(dir, 10).project(cam);
    expect(Math.abs(out.x), name).toBeLessThan(0.001);
    expect(Math.abs(out.y), name).toBeLessThan(0.001);
    // the wall cases must not silently be the open pose
    if (boxes.length > 0) expect(stateOfPose(pose).look.equals(pose.openLook)).toBe(false);
  }
});
