// The size a mech walks at (SB-045, SB-100): MOVE_TUNE is written for the 4 m mech (MECH_TUNE), and this scales it for
// another height. #view-fx's ?mech= uses it. Pure functions, so a node test can check the proportions.
import { MECH_TUNE, type MoveTune } from '../data/tune.ts';

export const MECH_BASE_HEIGHT = MECH_TUNE.height; // the height the tune tables are written for (m)

export interface MechScaleOptions {
  move: boolean; // scale the walking and boosting speeds with the mech (0 does not)
}

export interface MechScale {
  moveTune: MoveTune;
}

// The tables to run the mech with at `mech` metres tall. A jump's start speed grows with the square root, so the jump's
// height stays the same share of the mech while gravity stays as it is. Only the look tools run a larger mech, so a
// scaled jump may clear what the 4 m mech cannot (an 8 m mech clears a 4 m block): the game's own map is not for it.
export function scaleForMech(mech: number, moveTune: MoveTune, opts: MechScaleOptions): MechScale {
  const ratio = Math.max(0.01, mech / MECH_BASE_HEIGHT);
  const move = { ...moveTune };
  if (opts.move) {
    move.walk *= ratio;
    move.accel *= ratio;
    move.boost *= ratio;
    move.boostAccel *= ratio;
    move.jump *= Math.sqrt(ratio);
  }
  return { moveTune: move };
}
