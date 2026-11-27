// The aim the cursor gives the overview camera (ticket 2197): pure functions, so a node test can try it. The dev entries
// fill MechInput from it: `frame` is the direction the movement input is taken from and `face` the yaw to turn toward.
import type { MechInput } from '../logic/mech.ts';
import { groundPoint, type QuarterPose } from '../view/quarterCamera.ts';

// How near the mech an aim point is too close to turn toward (m), the same value and reason as the body's AIM_MIN_DIST
// (logic/game.ts): a point under its feet would spin it every frame.
const AIM_MIN_DIST = 0.9;

// The movement frame and the yaw the cursor asks for. With no pose (the first frame) or no ground point (the top edge
// above the horizon) the yaw is held, so the turn keys do not take the aim over. A cursor left out is the middle of the
// screen. `azimuth` is the overview camera's, which the movement input is taken from.
export function quarterAimInput(
  pose: QuarterPose | null,
  fov: number,
  aspect: number,
  cursor: { x: number; y: number } | null,
  mech: { x: number; y: number; z: number; yaw: number },
  azimuth: number,
): Pick<MechInput, 'frame' | 'face'> {
  if (pose === null) return { frame: azimuth, face: mech.yaw };
  const at = groundPoint(pose, fov, aspect, cursor ?? { x: 0, y: 0 }, mech.y);
  if (at === null || Math.hypot(at.x - mech.x, at.z - mech.z) < AIM_MIN_DIST) {
    return { frame: azimuth, face: mech.yaw };
  }
  // the body's faceTo: yaw 0 faces -z and grows turning left
  return { frame: azimuth, face: Math.atan2(-(at.x - mech.x), -(at.z - mech.z)) };
}
