// Whether the camera is so near the mech that the mech is drawn see-through (SB-1473). A wall that pushes the camera in
// is the usual cause; the check reads only positions, so a unit test can run it without a scene.
import { MECH_TUNE } from '../data/tune.ts';

export interface FadePoint {
  x: number;
  y: number;
  z: number;
}

export function mechSeeThrough(camera: FadePoint, mech: FadePoint): boolean {
  const dx = camera.x - mech.x;
  const dy = camera.y - (mech.y + MECH_TUNE.chestHeight);
  const dz = camera.z - mech.z;
  return Math.hypot(dx, dy, dz) < MECH_TUNE.fadeDist;
}
