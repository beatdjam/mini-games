// The movement values a mech is built with (SB-130's third card): MOVE_TUNE with its legs' changes on top. Pure, so a
// node test can check that the biped keeps the standard and the other legs differ the way they should.
import { PARTS, type MechBuild } from '../data/mech.ts';
import { LEG_MOVE_TUNE, MOVE_TUNE } from '../data/tune.ts';
import type { MoveTune } from '../data/tuneTypes.ts';

export function moveTuneOf(build: MechBuild, base: MoveTune = MOVE_TUNE): MoveTune {
  const gait = PARTS.legs[build.legs].gait;
  if (gait === undefined) throw new Error(`legs ${build.legs} have no gait`);
  return { ...base, ...LEG_MOVE_TUNE[gait] };
}
