// The camera's distance from the look point as the mech walks the fortress's yard past its blocks and wrecks (SB-2048): with
// every prop a wall (wallHeight 0, the old camera) the distance jumps, and with the low props left out of the walls it
// changes by no more than the walls' own pull from frame to frame.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { CAMERA_TUNE, FADE_TUNE } from '../../src/data/tune.ts';
import { lowRects } from '../../src/view/fade.ts';
import { step } from '../../src/logic/game.ts';
import { cameraBlockers } from '../../src/logic/mapShapes.ts';
import { cameraBoxesOfRect, cameraPose, followCamera, type CameraState } from '../../src/view/camera.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;

function boxes(wallHeight: number): THREE.Box3[] {
  const rects = cameraBlockers(M1B_HAND);
  const low = lowRects(M1B_HAND, rects.length, { wallHeight });
  return rects.filter((_, i) => !low[i]).flatMap(cameraBoxesOfRect);
}

type Path = (frame: number) => { moveX: number; moveZ: number; turn: number };
const paths: Record<string, { x: number; z: number; yaw: number; frames: number; input: Path }> = {
  // circle round the block at (-20,-84)
  orbit: { x: -20, z: -92, yaw: 0, frames: 900, input: () => ({ moveX: 0, moveZ: 1, turn: 0.016 }) },
  // along the left wall, forward and then back
  wall: {
    x: -30,
    z: -76,
    yaw: 0,
    frames: 900,
    input: f => ({ moveX: -0.3, moveZ: f < 450 ? 1 : -1, turn: 0 }),
  },
  // weave between the blocks and wrecks
  weave: {
    x: 0,
    z: -78,
    yaw: 0,
    frames: 1200,
    input: f => ({ moveX: 0, moveZ: 1, turn: Math.sin(f / 40) * 0.03 }),
  },
  // strafe past the wrecks while facing the land wall
  strafe: {
    x: -20,
    z: -100,
    yaw: 0,
    frames: 900,
    input: f => ({ moveX: Math.floor(f / 150) % 2 === 0 ? 1 : -1, moveZ: Math.sin(f / 70) > 0 ? 0.5 : -0.5, turn: 0 }),
  },
  // boost along the yard sides
  zig: {
    x: 18,
    z: -80,
    yaw: 0,
    frames: 900,
    input: f => ({ moveX: Math.sin(f / 25), moveZ: 1, turn: Math.cos(f / 55) * 0.02 }),
  },
};

const MAX_JUMP = 0.35; // m in one frame: pullSpeed (9 m/s) is 0.15 m a frame, plus the mech's own step

interface Run {
  max: number; // the largest change of the distance in one frame (m)
  over: number; // the frames that changed it by more than 0.15 m (pullSpeed's step)
  flips: number; // how often a wall began or stopped pulling the camera in
}

function walk(wallHeight: number, path: (typeof paths)[string]): Run {
  const walls = boxes(wallHeight);
  const game = newPlayGame(M1B_HAND);
  game.enemies = [];
  game.mech.x = path.x;
  game.mech.z = path.z;
  game.mech.yaw = path.yaw;
  let state: CameraState | null = null;
  let prevDist = NaN;
  let prevPulled = false;
  const run: Run = { max: 0, over: 0, flips: 0 };
  for (let frame = 0; frame < path.frames; frame++) {
    step(game, { ...path.input(frame), jump: false, jumpHeld: false, boost: false, fire: false, sub: false }, DT);
    game.armor = 1000;
    const pose = cameraPose(
      { x: game.mech.x, y: game.mech.y, z: game.mech.z, yaw: game.mech.yaw },
      0,
      CAMERA_TUNE,
      walls,
    );
    state = followCamera(state, pose, DT, CAMERA_TUNE);
    const dist = Math.hypot(state.pos.x - state.look.x, state.pos.z - state.look.z);
    if (!Number.isNaN(prevDist)) {
      const change = Math.abs(dist - prevDist);
      run.max = Math.max(run.max, change);
      if (change > 0.15) run.over++;
    }
    if (frame > 0 && pose.pulled !== prevPulled) run.flips++;
    prevDist = dist;
    prevPulled = pose.pulled;
  }
  return run;
}

test('the yard walks have no jump in the distance once the low props are not walls', () => {
  for (const [name, path] of Object.entries(paths)) {
    const old = walk(0, path);
    const now = walk(FADE_TUNE.wallHeight, path);
    expect(now.max, name).toBeLessThan(MAX_JUMP);
    expect(now.over, name).toBeLessThanOrEqual(old.over);
    expect(now.flips, name).toBeLessThanOrEqual(old.flips);
  }
  // the old camera jumped on the walks that go round the cover
  expect(walk(0, paths.orbit).max).toBeGreaterThan(1);
  expect(walk(0, paths.weave).max).toBeGreaterThan(1);
}, 60_000);
