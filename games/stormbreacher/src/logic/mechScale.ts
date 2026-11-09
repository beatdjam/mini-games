// The size of the mech #view-fx walks (SB-045): the props and the allies stay the size they are, so the mech can be made
// smaller to compare. This is only the view's numbers; MOVE_TUNE and CAMERA_TUNE themselves are not changed, and no
// other view sees these. Pure functions, so a node test can check the proportions.
import type { CameraTune, MoveTune } from '../data/tune.ts';

export const MECH_BASE_HEIGHT = 8; // the height the tune tables are written for (m)

export interface MechScaleOptions {
  camera: boolean; // scale the camera's distances with the mech (0 does not)
  move: boolean; // scale the walking and boosting speeds with the mech (0 does not)
}

export interface MechScale {
  cameraTune: CameraTune;
  moveTune: MoveTune;
}

// The tables to run the mech with at `mech` metres tall. A jump's start speed grows with the square root, so the jump's
// height stays the same share of the mech while gravity stays as it is.
export function scaleForMech(
  mech: number,
  moveTune: MoveTune,
  cameraTune: CameraTune,
  opts: MechScaleOptions,
): MechScale {
  const ratio = Math.max(0.01, mech / MECH_BASE_HEIGHT);
  const move = { ...moveTune };
  const camera = { ...cameraTune };
  if (opts.move) {
    move.walk *= ratio;
    move.accel *= ratio;
    move.boost *= ratio;
    move.boostAccel *= ratio;
    move.jump *= Math.sqrt(ratio);
  }
  if (opts.camera) {
    camera.dist *= ratio;
    camera.height *= ratio;
    camera.shoulder *= ratio;
    camera.lookHeight *= ratio;
    camera.aimDist *= ratio;
  }
  return { cameraTune: camera, moveTune: move };
}
