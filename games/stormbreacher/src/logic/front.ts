// The front line the allies hold, read from the mission script's flags (SB-2010). A checkpoint or a suspend keeps the
// flags, so the line comes back where it was without a field of its own. Pure: no three and no DOM.
import { PILLBOXES_FLAG, LINE1_FLAG, LINE2_FLAG, FRONT_TUNE, FRONT_HOLD } from '../data/front.ts';

export type FrontId = 'beach' | 'line1' | 'line2' | 'pillboxes';

export interface FrontLine {
  id: FrontId;
  z: number; // the line's z on the map (m); +z is the sea
  holdZ: number; // where the battle layer's infantry waits while the line is held (m)
}

// The last line the script's flags have taken. No flag is the beach the landing leaves the allies on.
export function frontOf(flags: readonly string[]): FrontLine {
  if (flags.includes(PILLBOXES_FLAG)) {
    return { id: 'pillboxes', z: FRONT_TUNE.pillboxesZ, holdZ: FRONT_HOLD.pillboxesZ };
  }
  if (flags.includes(LINE2_FLAG)) {
    return { id: 'line2', z: FRONT_TUNE.line2Z, holdZ: FRONT_HOLD.line2Z };
  }
  if (flags.includes(LINE1_FLAG)) {
    return { id: 'line1', z: FRONT_TUNE.line1Z, holdZ: FRONT_HOLD.line1Z };
  }
  return { id: 'beach', z: FRONT_TUNE.beachZ, holdZ: FRONT_HOLD.beachZ };
}
