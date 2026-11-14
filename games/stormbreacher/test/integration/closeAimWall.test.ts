// A shot at a grunt 3 and 5 m ahead while a wall stands 1 m behind the mech or 1 m to its right (SB-1935): the grunt
// stands on the middle of the screen, not on the open camera's line, and the shot must land on it.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { CAMERA_TUNE } from '../../src/data/tune.ts';
import type { Prop } from '../../src/data/types.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import { step, type GameModel } from '../../src/logic/game.ts';
import { seed } from '../../src/logic/rng.ts';
import { aimRay, cameraBoxes, cameraPose, followCamera, type CameraState } from '../../src/view/camera.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
const MECH_Z = 100; // the mech faces -z (m)
const SHOTS = 20;
const WANT_HIT = 18; // 90%
const SETTLE = 120; // frames the camera settles before the shot

const idle = { moveX: 0, moveZ: 0, turn: 0, jump: false, jumpHeld: false, boost: false, fire: false, sub: false };

function gameWith(wall: Prop): GameModel {
  const game = newPlayGame({ ...M1B_HAND, props: [wall], targets: [], mines: [] });
  game.mech.x = 0;
  game.mech.z = MECH_Z;
  game.mech.yaw = 0;
  return game;
}

// The camera settled at the mech's place, with the game's own walls.
function settledCamera(game: GameModel): CameraState {
  const boxes = cameraBoxes(game.rects);
  let state: CameraState | null = null;
  for (let frame = 0; frame < SETTLE; frame++) {
    const pose = cameraPose(
      { x: game.mech.x, y: game.mech.y, z: game.mech.z, yaw: game.mech.yaw },
      0,
      CAMERA_TUNE,
      boxes,
    );
    state = followCamera(state, pose, DT, CAMERA_TUNE);
  }
  return state!;
}

// Fires SHOTS at a grunt standing on the screen's middle line `dist` m ahead.
function hitsAt(wall: Prop, dist: number): number {
  seed(17);
  const game = gameWith(wall);
  const aim = aimRay(settledCamera(game));
  const targetZ = MECH_Z - dist;
  const t = (targetZ - aim.oz) / aim.dz;
  const x = aim.ox + aim.dx * t;
  game.enemies = [newEnemy('wall-target', 'test', 'grunt', x, targetZ, 0)];
  const enemy = game.enemies[0];
  let fired = 0;
  let hits = 0;
  const take = (): void => {
    for (const event of game.events) {
      if (event.kind === 'shot') fired++;
      if (event.kind === 'hit' && event.enemy === 'wall-target') hits++;
    }
  };
  for (let frame = 0; frame < 600 && fired < SHOTS; frame++) {
    enemy.hp = 40;
    step(game, { ...idle, fire: true, aim }, DT);
    take();
    if (fired >= SHOTS) {
      for (let i = 0; i < 30; i++) {
        enemy.hp = 40;
        step(game, { ...idle, aim }, DT);
        take();
      }
    }
  }
  return hits;
}

const behind: Prop = { kind: 'block', x: 0, z: MECH_Z + 3, yaw: 0, scale: 1 }; // spans z +1 to +5: 1 m behind
const right: Prop = { kind: 'block', x: 4, z: MECH_Z, yaw: 0, scale: 1 }; // spans x +1 to +7: 1 m right

for (const dist of [3, 5]) {
  test(`a grunt ${dist} m ahead on the screen's middle, with a wall 1 m behind: 20 shots`, () => {
    expect(hitsAt(behind, dist)).toBeGreaterThanOrEqual(WANT_HIT);
  });
  test(`a grunt ${dist} m ahead on the screen's middle, with a wall 1 m to the right: 20 shots`, () => {
    expect(hitsAt(right, dist)).toBeGreaterThanOrEqual(WANT_HIT);
  });
}
