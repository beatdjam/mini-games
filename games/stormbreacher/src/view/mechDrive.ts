// Moves the sortie's mech body from the game's state (SB-130's third card). It reads the mech's speed and footing and
// the frame's events, and never writes the game; the boxes move in view/mechModel.ts.
import type * as THREE from 'three';
import { M1_MECH } from '../data/mech.ts';
import type { GameModel } from '../logic/game.ts';
import type { MotionInput } from './mechMotion.ts';
import { animateMech } from './mechModel.ts';

// What the frame's events tell the motion: the landing's falling speed, and whether the main weapon fired (the back
// weapon does not pull the arms).
export function motionInputOf(game: GameModel): MotionInput {
  const mech = game.mech;
  let landSpeed: number | null = null;
  let fired = false;
  for (const event of game.events) {
    if (event.kind === 'mech' && event.event.kind === 'land') landSpeed = event.event.speed;
    else if (event.kind === 'shot' && event.weapon === M1_MECH.main) fired = true;
  }
  return { speed: Math.hypot(mech.vx, mech.vz), grounded: mech.grounded, boosting: mech.boosting, landSpeed, fired };
}

export function drawMechMotion(model: THREE.Object3D, game: GameModel, dt: number): void {
  animateMech(model, motionInputOf(game), dt);
}

// A cutscene walks the mech by a path (data/cutscenes.ts), not by the game's state: the legs swing at the path's speed
// on the ground, and nothing else moves.
export function drawMechWalk(model: THREE.Object3D, speed: number, dt: number): void {
  animateMech(model, { speed, grounded: true, boosting: false, landSpeed: null, fired: false }, dt);
}
