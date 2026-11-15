// The front line of M1 (SB-2010, SB-2020): how far the allies hold the ground, and where the battle layer's infantry
// waits. The front line moves at the three milestones: line 1's breach, line 2's breach and the pillbox line's fall.
// The values are provisional and meant to be settled by eye in the sortie. +z is the sea.
import { BATTLE_TUNE } from './tune.ts';

// The flag line 1's cue raises. The front line and the battle layer read it.
export const LINE1_FLAG = 'line1-open';

// The flag line 2's cue raises (SB-2020). The front line moves to the middle line on it.
export const LINE2_FLAG = 'line2-open';

// The flag the pillbox line's cue raises. It was already the flag the battle layer read before the front line came.
export const PILLBOXES_FLAG = 'pillboxes-down';

// The z of each front line (m). `beach` is the strip the allies hold after the landing, `line1` and `line2` the two
// hedgehog rows the charges open, and `pillboxes` the bunker line the objective names.
export const FRONT_TUNE = {
  beachZ: 155, // m
  line1Z: 137, // m; line 1's middle
  line2Z: 68, // m; line 2's middle
  pillboxesZ: -15, // m; the two pillboxes stand on this line
};

// The z where the battle layer's infantry waits at each front. `beach`, `line1`, `line2` and `pillboxes` line up with
// the four front lines; `BATTLE_TUNE.holdZ` stays the pillbox line's value from s3-3.
export const FRONT_HOLD = {
  beachZ: BATTLE_TUNE.holdBeachZ,
  line1Z: BATTLE_TUNE.holdLine1Z,
  line2Z: BATTLE_TUNE.holdLine2Z,
  pillboxesZ: BATTLE_TUNE.holdZ,
} as const;
