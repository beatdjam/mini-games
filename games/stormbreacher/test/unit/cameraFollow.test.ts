// The camera's state across frames (SB-1935, SB-1945): with no wall the camera takes the open lag's step exactly; a
// wall eases only its own share of the move; and the aim is the middle of the screen the state drew.
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
const MAX_FRAME_TURN = 5; // deg
const PULL_STEP = CAMERA_TUNE.pullSpeed * DT; // the most a wall's share may move the camera in one frame (m)
const WITHIN = 1e-9; // m

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

// The direction from the camera to the point it looks at, normalized.
const view = (state: CameraState): THREE.Vector3 => state.look.clone().sub(state.pos).normalize();

// The most one frame moved the camera relative to the mech, and the most the screen turned (deg).
function motion(states: readonly CameraState[]): { rel: number; turn: number } {
  let rel = 0;
  let turn = 0;
  for (let i = 1; i < states.length; i++) {
    const travel = new THREE.Vector3(
      states[i].feet.x - states[i - 1].feet.x,
      0,
      states[i].feet.z - states[i - 1].feet.z,
    );
    rel = Math.max(
      rel,
      states[i].pos
        .clone()
        .sub(states[i - 1].pos)
        .sub(travel)
        .length(),
    );
    const dot = Math.min(1, Math.max(-1, view(states[i]).dot(view(states[i - 1]))));
    turn = Math.max(turn, Math.acos(dot) * DEG);
  }
  return { rel, turn };
}

// The smallest distance from the camera to the mech's chest while the mech backs up along +z for two seconds.
function minChest(boxes: readonly THREE.Box3[]): number {
  const targets = Array.from({ length: Math.round(SECONDS / DT) }, (_, frame) => at(0, BOOST * frame * DT));
  const states = followFrames(targets, boxes);
  return Math.min(
    ...states.map((state, frame) =>
      state.pos.distanceTo(new THREE.Vector3(0, MECH_TUNE.chestHeight, BOOST * frame * DT)),
    ),
  );
}

// With no wall the camera takes the open lag's step: nothing but the wall may ease it.
for (const [name, pitch, next] of [
  ['a forward boost', 0, at(0, -BOOST * DT)],
  ['a backward boost', 0, at(0, BOOST * DT)],
  ['a turn', 0, at(0, 0, 0.3)],
  ['looking down', CAMERA_TUNE.pitchMin, at(0, BOOST * DT)],
  ['looking up', CAMERA_TUNE.pitchMax, at(0, BOOST * DT)],
] as const) {
  test(`no wall, ${name}: the camera takes the open lag's step`, () => {
    const prev = stateOfPose(cameraPose(at(0, 0), pitch, CAMERA_TUNE, []));
    const pose = cameraPose(next, pitch, CAMERA_TUNE, []);
    const state = followCamera(prev, pose, DT, CAMERA_TUNE);
    const lagged = followPose(prev.pos, pose.pos, DT, CAMERA_TUNE.lag);
    expect(state.pos.distanceTo(lagged)).toBeLessThan(WITHIN);
  });
}

test('a boost for two seconds in the open: every frame is the open lag step', () => {
  let state: CameraState | null = null;
  let lagged: THREE.Vector3 | null = null;
  for (let frame = 0; frame < Math.round(SECONDS / DT); frame++) {
    const pose = cameraPose(at(0, -BOOST * frame * DT), 0, CAMERA_TUNE, []);
    state = followCamera(state, pose, DT, CAMERA_TUNE);
    lagged = lagged === null ? pose.pos.clone() : followPose(lagged, pose.pos, DT, CAMERA_TUNE.lag);
    expect(state.pos.distanceTo(lagged), `frame ${frame}`).toBeLessThan(WITHIN);
  }
});

// The wall behind the mech at 1 m, 20 m long: the mech walks +x past its end while the camera follows.
const wallBehind = (): THREE.Box3[] => cameraBoxes([{ x: 0, z: 2, halfW: 10, halfD: 1, yaw: 0, top: 6 }]);

// The wall's share of the move alone is held to pullSpeed; the mech's own travel is followed exactly.
for (const speed of [7.5, BOOST]) {
  test(`walking past a wall's end at ${speed} m/s: the wall's share slides and the screen turns little`, () => {
    const settle = Array.from({ length: 30 }, () => at(0, 0));
    const run = Array.from({ length: 240 }, (_, frame) => at(speed * frame * DT, 0));
    const { rel, turn } = motion(followFrames([...settle, ...run], wallBehind()));
    expect(rel).toBeLessThanOrEqual(PULL_STEP + 1e-6);
    expect(turn).toBeLessThanOrEqual(MAX_FRAME_TURN);
  });
}

test('a wall that lets go while the mech backs and slides: no jump and no sudden turn', () => {
  // The mech faces +x and slides along +z past the seawall's end at 12 m/s, backing toward the wall a little. The wall
  // was holding the camera close to the mech; once its end is passed the camera comes back out.
  const wall = cameraBoxes([{ x: -2, z: 0, halfW: 1, halfD: 10, yaw: 0, top: 6 }]);
  const settle = Array.from({ length: 30 }, () => at(0, 5, -Math.PI / 2));
  const run = Array.from({ length: 180 }, (_, frame) => {
    const t = frame * DT;
    return at(-0.2 * t, 5 + 12 * t, -Math.PI / 2);
  });
  const { rel, turn } = motion(followFrames([...settle, ...run], wall));
  expect(rel).toBeLessThanOrEqual(PULL_STEP + 1e-6);
  expect(turn).toBeLessThanOrEqual(MAX_FRAME_TURN);
});

test('backing the mech up for two seconds never walks the camera into its chest, with or without a wall', () => {
  // The wall's near face is 5 m past where the two seconds of backing end: it presses the camera in late, then the mech
  // reaches the end of the run before the wall stops it.
  expect(minChest([]), 'the open').toBeGreaterThan(MECH_TUNE.fadeDist);
  expect(minChest(cameraBoxes([{ x: 0, z: 38, halfW: 10, halfD: 3, yaw: 0, top: 6 }])), 'a wall').toBeGreaterThan(
    MECH_TUNE.fadeDist,
  );
});

// The targets of a run that ends at a wall: settle, travel along `ratio` (x to z) at `speed` until the mech stands
// `stopZ` from the start, then stand there for 90 frames while the camera settles.
function runIntoWall(ratio: number, speed: number, stopZ: number, yaw: number): CameraTarget[] {
  const length = Math.hypot(ratio, 1);
  const dir = { x: ratio / length, z: 1 / length };
  const seconds = stopZ / (speed * dir.z);
  const settle = Array.from({ length: 30 }, () => at(0, 0, yaw));
  const run = Array.from({ length: Math.ceil(seconds / DT) }, (_, frame) => {
    const t = Math.min((frame + 1) * DT, seconds);
    return at(dir.x * speed * t, dir.z * speed * t, yaw);
  });
  const end = run[run.length - 1];
  const watch = Array.from({ length: 90 }, () => at(end.x, end.z, yaw));
  return [...settle, ...run, ...watch];
}

test('backing or sliding into a wall until the mech stops never puts the camera in a box', () => {
  const boxes = cameraBoxes([{ x: 0, z: 38, halfW: 10, halfD: 3, yaw: 0, top: 6 }]); // near face z = 35
  const runs: Array<[string, CameraTarget[]]> = [
    ['backing up at 15 m/s', runIntoWall(0, BOOST, 34, 0)],
    ['diagonally back at 15 m/s', runIntoWall(0.2, BOOST, 34, 0)],
    ['walking sideways at 7.5 m/s', runIntoWall(0, 7.5, 34, Math.PI / 2)],
  ];
  for (const [name, targets] of runs) {
    const states = followFrames(targets, boxes);
    const end = targets[targets.length - 1];
    const chest = new THREE.Vector3(end.x, MECH_TUNE.chestHeight, end.z);
    let inside = 0;
    let nearest = Infinity;
    for (const state of states) {
      if (boxes.some(box => box.containsPoint(state.pos))) inside++;
      nearest = Math.min(nearest, state.pos.distanceTo(chest));
    }
    expect(inside, name).toBe(0);
    expect(nearest, name).toBeGreaterThan(MECH_TUNE.radius);
  }
});

test('a far wall that lets go brings the camera back at pullSpeed, without a jump', () => {
  // The wall stands 6 m ahead; the mech slides along +x out from behind it. The wall never added its share to the look
  // point, so the camera comes back at pullSpeed rather than returnSpeed, and must not jump.
  const wall = cameraBoxes([{ x: 2.15, z: 6.5, halfW: 1, halfD: 0.5, yaw: 0, top: 6 }]);
  const settle = Array.from({ length: 60 }, () => at(0, 0));
  const run = Array.from({ length: 180 }, (_, frame) => at(3 * frame * DT, 0));
  const { rel, turn } = motion(followFrames([...settle, ...run], wall));
  expect(rel).toBeLessThanOrEqual(PULL_STEP + 1e-6);
  expect(turn).toBeLessThanOrEqual(1);
});

test('a frame of no time gives the camera a place, not a NaN', () => {
  const prev = stateOfPose(cameraPose(at(0, 0), 0, CAMERA_TUNE, []));
  const pose = cameraPose(at(0, BOOST * DT), 0, CAMERA_TUNE, wallBehind());
  const state = followCamera(prev, pose, 0, CAMERA_TUNE);
  expect([state.pos.x, state.pos.y, state.pos.z].every(Number.isFinite)).toBe(true);
});

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
