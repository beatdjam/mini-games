// The landing's values (SB-120): where the mech stands on the craft when the sortie begins. The craft's sizes are in
// data/craft.ts.
export const LANDING_TUNE = {
  startDepth: 2, // where the mech stands on the deck, past the ramp's hinge (m); 2.5 or less keeps the camera off the stern wall
} as const;
