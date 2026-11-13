// The infantry's pose (SB-1640): how high the body and the head stand, and how they lie once the soldier is down. Shared by
// the battle's soldiers (view/battle/index.ts) and the riders on the landing craft (view/riders.ts), so both look alike.
export const SOLDIER_POSE = {
  bodyY: 0.62, // the body's middle above the feet (m)
  headY: 1.36, // the head's middle above the feet (m)
  bodyDeadY: 0.24, // the body's middle once it lies down (m)
  headDeadY: 0.2, // the head's middle once it lies down (m)
  headForward: 0.78, // how far the head lies past the body (m)
} as const;
