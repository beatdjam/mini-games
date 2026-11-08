// Named values for the empty field: the ground, the fog, the camera and the box that shows a mech's size.
export const FIELD_TUNE = {
  groundSize: 400, // the ground plane's side (m)
  fogNear: 60, // where the fog starts (m)
  fogFar: 160, // where the fog hides everything (m)
  viewFar: 200, // the camera's far plane (m), past the fog's end
  mechHeight: 8, // the size box's height (m); a mech is about 7-10 m tall
  camDist: 17, // the start camera's horizontal distance from the box (m)
  camHeight: 6, // the start camera's height above the box's middle (m)
  touchMaxFps: 60, // the frame cap on a phone (frames a second)
};

// The third-person camera's starting values (SB-020). Distances are measured on the ground plane unless noted.
export const CAMERA_TUNE = {
  dist: 17.2, // the camera's horizontal distance from the look point (m)
  height: 3.0, // how far the camera sits above the look point (m)
  shoulder: 4.3, // how far the look point moves to the mech's right (m)
  lookHeight: 5.8, // the look point's height above the mech's feet (m)
  minDist: 0.5, // the shortest horizontal distance a wall may pull the camera to (m): near 0, so the camera stays on this side of any wall farther than this
  margin: 0.6, // the gap kept in front of a wall (m)
  pitchMin: -0.5, // the lowest pitch the camera may look, looking down (rad)
  pitchMax: 0.8, // the highest pitch the camera may look, looking up (rad)
  lag: 0.12, // the time constant for the camera to reach its target position (s); 0 means no lag
  fov: 72, // the vertical field of view (deg)
  aimDist: 10.2, // the camera's horizontal distance while aiming (m)
  aimFov: 52, // the vertical field of view while aiming (deg)
  walk: 7.4, // the model's walking speed in #view-camera (m/s)
};

export type CameraTune = typeof CAMERA_TUNE;

// The mech's movement on flat ground (SB-025). Speeds are m/s, accelerations m/s^2.
export const MOVE_TUNE = {
  walk: 15, // the walking speed (m/s)
  accel: 80, // how fast walking speeds up (m/s^2)
  decel: 90, // how fast the mech slows down with no input (m/s^2)
  jump: 10.2, // the upward speed a jump starts with (m/s)
  gravity: 25, // the downward pull in the air (m/s^2)
  airControl: 0.4, // the share of the walking acceleration that works in the air (0-1)
  boost: 30, // the boost's speed (m/s)
  boostAccel: 160, // how fast the boost speeds up (m/s^2)
  boostDrain: 0.5, // the gauge a second of boosting uses (gauge/s)
  boostRegen: 0.35, // the gauge a second on the ground gives back (gauge/s)
  hoverFall: 1.5, // the fastest a hover lets the mech fall (m/s)
  hoverDrain: 0.3, // the gauge a second of hovering uses (gauge/s)
  boostLift: 0, // the upward acceleration while boosting in the air (m/s^2); 0 falls while moving forward
  landStop: 0.12, // how long a landing stops the mech from walking (s)
  turn: 2.6, // how fast the turn keys change the yaw (rad/s)
  maxStep: 1 / 120, // the longest step a frame is split into (s)
};

export type MoveTune = typeof MOVE_TUNE;

// The feel of moving and firing (SB-025): camera and screen effects. Angles are in degrees, but only the FOV uses them.
export const FEEL_TUNE = {
  boostFov: 10, // how much wider the field of view gets while boosting (deg)
  fovRate: 8, // how fast the field of view reaches its target (1/s)
  landShake: 0.35, // the landing's shake at a falling speed of 10 m/s (m)
  fireShake: 0.06, // the shake a shot adds (m)
  shakeDecay: 10, // how fast the shake dies away (1/s)
  hitStop: 0.05, // how long a hit stops the mech (s)
  dust: 1, // the multiplier on how much dust a burst makes; 0 makes none
  fireRate: 8, // the shots a second while the fire key is held (shots/s)
};

export type FeelTune = typeof FEEL_TUNE;

// The three ways the aim assist (FCS) may work (SB-060). `manual` does nothing, `soft` pulls the shot toward the
// nearest target in the aim circle, and `hard` locks a target after a short wait and follows it.
export type FcsKind = 'manual' | 'soft' | 'hard';

// One FCS's values. Angles are degrees, `range` is m, `pull` and `trackRate` are degrees a second, `lockTime` is s.
export interface FcsTune {
  cone: number; // the aim circle's half-angle (deg); soft and hard use it, manual does not
  range: number; // the farthest a target may be from the mech's chest (m); every kind uses it
  spread: number; // how far a shot drifts inside its cone (deg); every kind uses it
  pull: number; // soft: how fast the aim turns toward the target (deg/s); the other kinds keep it 0
  lockTime: number; // hard: how long the target stays in the circle before it is caught (s); the other kinds keep it 0
  trackRate: number; // hard: how fast the muzzle follows a caught target (deg/s); the other kinds keep it 0
  breakCone: number; // hard: how far a caught target may drift from the aim before the lock breaks (deg); the other kinds keep it 0
}

// The starting values of each kind. The numbers decide nothing here: SB-060 compares them by hand.
export const FCS_TUNE: Record<FcsKind, FcsTune> = {
  manual: { cone: 0, range: 200, spread: 0.5, pull: 0, lockTime: 0, trackRate: 0, breakCone: 0 },
  soft: { cone: 8, range: 200, spread: 0.8, pull: 20, lockTime: 0, trackRate: 0, breakCone: 0 },
  hard: { cone: 12, range: 180, spread: 1.5, pull: 0, lockTime: 0.35, trackRate: 90, breakCone: 20 },
};

// The moving dummies of #view-fcs (SB-060). `hp` is the hits a dummy takes, `speed` is how fast it moves (m/s), and
// `respawn` is how long a downed dummy stays down (s).
export const DUMMY_TUNE = {
  hp: 10, // hits needed to down a dummy
  speed: 8, // how fast a moving dummy travels (m/s)
  respawn: 1.5, // how long after a down a dummy comes back (s)
};

export type DummyTune = typeof DUMMY_TUNE;
