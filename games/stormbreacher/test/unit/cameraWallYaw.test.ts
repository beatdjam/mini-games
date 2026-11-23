// The screen's left-right facing stays on the mech's aim near a wall (SB-2040): backing into a wall while looking down must
// not turn the screen. The facing is the horizontal direction from the camera to the point it looks at, measured on the
// state the view draws.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { CAMERA_TUNE } from '../../src/data/tune.ts';
import {
  aimRay,
  cameraBoxes,
  cameraPose,
  followCamera,
  type CameraState,
  type CameraTarget,
} from '../../src/view/camera.ts';

const DT = 1 / 60;
const SETTLE = 90;
const BOOST = 25; // m/s
const LIMIT = (5 * Math.PI) / 180; // the screen may be at most 5 degrees off the aim

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

// How far the screen's facing is from the mech's aim (rad, 0 to PI).
function offAim(state: CameraState, yaw: number): number {
  const ray = aimRay(state); // the line through the middle of the screen
  return Math.abs(wrap(Math.atan2(-ray.dx, -ray.dz) - yaw));
}

interface Run {
  worst: number; // rad
  worstFrame: number;
}

function run(targets: readonly (CameraTarget & { pitch: number })[], boxes: readonly THREE.Box3[], from = SETTLE): Run {
  let state: CameraState | null = null;
  let worst = 0;
  let worstFrame = 0;
  for (const [frame, t] of targets.entries()) {
    state = followCamera(state, cameraPose(t, t.pitch, CAMERA_TUNE, boxes), DT, CAMERA_TUNE);
    if (frame < from) continue;
    const off = offAim(state, t.yaw);
    if (off > worst) {
      worst = off;
      worstFrame = frame;
    }
  }
  return { worst, worstFrame };
}

const deg = (r: number): number => (r * 180) / Math.PI;

// A wall 1 m behind a mech facing -z (its back is +z), 20 m wide.
const wall = (): THREE.Box3[] => cameraBoxes([{ x: 0, z: 2, halfW: 10, halfD: 1, yaw: 0, top: 6 }]);

// The mech stands still, then boosts straight back (+z) toward the wall and stops 0.4 m from its face.
function back(dx: number, yawAt: (frame: number) => number, pitch: number): (CameraTarget & { pitch: number })[] {
  const frames = 140;
  const out: (CameraTarget & { pitch: number })[] = [];
  const startZ = -12;
  for (let i = 0; i < SETTLE; i++) out.push({ x: 0, y: 0, z: startZ, yaw: yawAt(i), pitch });
  let z = startZ;
  for (let i = 0; i < frames; i++) {
    z = Math.min(0.6, z + BOOST * DT);
    out.push({ x: dx * (z - startZ), y: 0, z, yaw: yawAt(SETTLE + i), pitch });
  }
  return out;
}

const down = CAMERA_TUNE.pitchMin;

test.each([
  ['straight back, looking down', 0, () => 0, down],
  ['straight back, a little down', 0, () => 0, -0.25],
  ['diagonal back, looking down', 0.6, () => 0, down],
  ['diagonal back, yaw 0.8 into the wall', 0.5, () => 0.8, down],
  ['back while swinging the camera, looking down', 0, (f: number) => Math.sin(f * 0.09) * 0.9, down],
  ['diagonal back while swinging, looking down', 0.5, (f: number) => Math.sin(f * 0.07) * 1.4, down],
] as const)('%s: the screen stays within 5 degrees of the aim', (_name, dx, yawAt, pitch) => {
  const result = run(back(dx, yawAt, pitch), wall());
  expect(deg(result.worst), `${_name}: worst at frame ${result.worstFrame}`).toBeLessThan(deg(LIMIT));
});
