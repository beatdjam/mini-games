// The infantry droids' pose (SB-1640, droids SB-1745, second pass SB-1747): how high the body and the head stand, and
// how low the body lies once the droid is down. Shared by the battle's droids (view/battle/index.ts) and the riders on
// the landing craft (view/riders.ts), so both look alike. The head stays on the body's neck, so only these three numbers
// are needed: on its back the whole droid turns about the body's middle and comes to rest at `bodyDeadY`.
export const SOLDIER_POSE = {
  bodyY: 0.62, // the body's middle above the feet (m)
  headY: 1.27, // the head's middle above the feet (m)
  bodyDeadY: 0.17, // the body's middle once the droid lies on its back (m)
} as const;
