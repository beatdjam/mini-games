// The touch screen's left stick and right drag turned into the top-down view's movement frame, aim point and facing
// (SB-2180). Pure, with no three and no DOM, so a node test can run it (the same as logic/input.ts).
import type { GameInput } from './game.ts';

// How far the right drag reaches for its aim point and how much of it is ignored (SB-2180).
export interface TouchAimTune {
  aimReach: number; // m, from the mech's feet along the drag's direction
  aimDeadzone: number; // px, a shorter drag counts as no touch of the right side
}

// The world ground direction of a screen vector: `dx` points right and `dy` points down (px or the stick's values).
// The screen's top is (-sin azimuth, -cos azimuth) and its right is (cos azimuth, -sin azimuth). The result keeps the
// screen vector's length (it is not normalized).
export function screenToGround(dx: number, dy: number, azimuth: number): { x: number; z: number } {
  const right = Math.cos(azimuth);
  const rightZ = -Math.sin(azimuth);
  const upX = -Math.sin(azimuth);
  const upZ = -Math.cos(azimuth);
  return { x: dx * right - dy * upX, z: dx * rightZ - dy * upZ };
}

// The ground point the right drag aims at, `tune.aimReach` m from the mech's feet along the drag's screen direction.
// A drag no longer than `tune.aimDeadzone` is no aim (null): the right side is not being touched.
export function dragAimPoint(
  mech: { x: number; z: number },
  drag: { x: number; y: number },
  azimuth: number,
  tune: TouchAimTune,
): { x: number; z: number } | null {
  if (Math.hypot(drag.x, drag.y) <= tune.aimDeadzone) return null;
  const dir = screenToGround(drag.x, drag.y, azimuth);
  const length = Math.hypot(dir.x, dir.z);
  return { x: mech.x + (dir.x / length) * tune.aimReach, z: mech.z + (dir.z / length) * tune.aimReach };
}

export interface TouchAimArgs {
  mech: { x: number; z: number };
  yaw: number;
  azimuth: number;
  drag: { x: number; y: number } | null;
  tune: TouchAimTune;
}

// What the main body and the arena add to a touch step: the screen's azimuth as the movement frame, and the drag's
// ground point as the aim. While the right side is not touched the mech keeps the yaw it last aimed at, so walking with
// the stick alone does not turn the aim (it can back off or strafe while it shoots the same way). A drag inside the
// deadzone counts as no touch of the right side.
export function touchAimInput(args: TouchAimArgs): Pick<GameInput, 'frame' | 'aimAt' | 'face'> {
  const frame = args.azimuth;
  if (args.drag !== null) {
    const at = dragAimPoint(args.mech, args.drag, args.azimuth, args.tune);
    if (at !== null) return { frame, aimAt: at };
  }
  return { frame, face: args.yaw };
}
