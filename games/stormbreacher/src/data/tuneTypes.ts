// The types of the mech's, the camera's and the FCS's tuning values only. The values are in tune.ts. This file reads
// nothing, so it can move into the engine together with logic/mech.ts, view/camera.ts and logic/fcs.ts (D-23).

export type MoveTune = {
  walk: number; // the walking speed (m/s)
  stepHeight: number; // the highest ledge the mech walks onto without a jump (m)
  accel: number; // how fast walking speeds up (m/s^2)
  decel: number; // how fast the mech slows down with no input (m/s^2)
  jump: number; // the upward speed a jump starts with (m/s)
  gravity: number; // the downward pull in the air (m/s^2)
  airControl: number; // the share of the walking acceleration that works in the air (0-1)
  boost: number; // the boost's speed (m/s)
  boostAccel: number; // how fast the boost speeds up (m/s^2)
  boostDrain: number; // the gauge a second of boosting uses (gauge/s)
  boostRegen: number; // the gauge a second on the ground gives back (gauge/s)
  hoverFall: number; // the fastest a hover lets the mech fall (m/s)
  hoverDrain: number; // the gauge a second of hovering uses (gauge/s)
  boostLift: number; // the upward acceleration while boosting in the air (m/s^2); 0 falls while moving forward
  landStop: number; // how long a landing stops the mech from walking (s)
  turn: number; // how fast the turn keys change the yaw (rad/s)
  maxStep: number; // the longest step a frame is split into (s)
};

export interface CameraTune {
  dist: number; // the camera's horizontal distance from the look point (m)
  height: number; // how far the camera sits above the look point (m)
  shoulder: number; // how far the look point moves to the mech's right (m)
  lookHeight: number; // the look point's height above the mech's feet (m)
  minDist: number; // the shortest horizontal distance a wall may pull the camera to (m): near 0, so the camera stays on this side of any wall farther than this
  margin: number; // the gap kept in front of a wall (m)
  pitchMin: number; // the lowest pitch the camera may look, looking down (rad)
  pitchMax: number; // the highest pitch the camera may look, looking up (rad)
  lag: number; // the time constant for the camera to reach its target position (s); 0 means no lag
  fov: number; // the vertical field of view (deg)
  aimDist: number; // the camera's horizontal distance while aiming (m)
  aimFov: number; // the vertical field of view while aiming (deg)
  walk: number; // the model's walking speed in #view-camera (m/s)
}

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
