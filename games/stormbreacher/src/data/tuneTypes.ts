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
  faceRate: number; // how fast the mech turns toward the point it is aimed at (rad/s)
  maxStep: number; // the longest step a frame is split into (s)
};

// The fixed-azimuth overview camera's values (D-50). `azimuth` is the direction the screen's up side points, with the
// mech's yaw's convention (0 faces -z and grows turning left).
export interface QuarterTune {
  azimuth: number; // the direction the top of the screen points (rad)
  height: number; // the camera's height above the look point (m)
  back: number; // the camera's horizontal distance behind the look point, toward the bottom of the screen (m)
  lead: number; // how far the look point moves from the mech toward the top of the screen (m)
  lookHeight: number; // the look point's height above the mech's feet (m)
  fov: number; // the vertical field of view (deg)
  lag: number; // the time constant for the camera to reach its target pose (s); 0 means no lag
}

export interface CameraTune {
  dist: number; // the camera's horizontal distance from the look point (m)
  height: number; // how far the camera sits above the look point (m)
  shoulder: number; // how far the look point moves to the mech's right (m)
  lookHeight: number; // the look point's height above the mech's feet (m)
  minDist: number; // the shortest horizontal distance a wall may pull the camera to (m): near 0, so the camera stays on this side of any wall farther than this
  margin: number; // the gap kept in front of a wall (m)
  pullSpeed: number; // the fastest a wall may bring the camera in, or hold a swing while it is near (m/s); keeps a corner from snapping
  pullGap: number; // the look point's return left after a wall lets go; at or below this the pull speed closes it (m)
  pullNear: number; // how much nearer than its open distance a wall-held camera counts as near (m)
  returnSpeed: number; // the fastest the camera comes back out after a wall lets it go (m/s)
  returnLag: number; // the time constant for coming back out (s)
  turnLag: number; // the time constant for the camera to swing round behind the mech's facing while a wall holds or releases it (s); the distance keeps returnSpeed and returnLag
  returnDelay: number; // a wall's release must last this long before the camera starts back out; a wall that pushes again sooner keeps it near (s); 0 returns at once
  releaseGap: number; // a wall lets the camera go when it is this much farther than the camera was (m)
  rise: number; // how far the camera rises at minDist, so it looks over the mech's shoulder (m)
  riseRange: number; // how far above minDist the rise has fallen to 0 (m)
  closeLook: number; // how far the look point moves toward the mech's front at minDist, so a close camera sees ahead, not down (m)
  closePitch: number; // the most the camera may look down past its open angle when a wall pulls it in (rad)
  fastTurn: number; // a turn this fast (rad/s) ends a wall's hold near the open place: the lag then cuts the corner (SB-1949)
  probeDeg: number; // how far to either side of a wall ray the camera looks, so a corner comes in smoothly (deg)
  pitchMin: number; // the lowest pitch the camera may look, looking down (rad)
  pitchMax: number; // the highest pitch the camera may look, looking up (rad)
  lag: number; // the time constant for the camera to reach its target position (s); 0 means no lag
  fov: number; // the vertical field of view (deg)
  aimDist: number; // the camera's horizontal distance while aiming (m)
  aimFov: number; // the vertical field of view while aiming (deg)
  walk: number; // the model's walking speed in #view-camera (m/s)
  wallHeight: number; // a blocking prop at least this tall is a wall the camera stays in front of; a lower one never pulls the camera and fades when it is between the camera and the mech (m); 0 makes every prop a wall (SB-2048)
  fadeOpacity: number; // how much of a faded prop is left (0-1)
  fadeIn: number; // the time a prop takes to fade out once it is between the camera and the mech (s)
  fadeOut: number; // the time it takes to come back once it is clear (s)
  fadePad: number; // how far beside a faded prop's box the camera-to-mech line may pass and still fade it (m)
}

// The three ways the aim assist (FCS) may work (SB-060). `manual` does nothing, `soft` pulls the shot toward the
// nearest target in the aim circle, and `hard` locks a target after a short wait and follows it.
export type FcsKind = 'manual' | 'soft' | 'hard';

// One FCS's values. Angles are degrees, `range` is m, `pull` and `trackRate` are degrees a second, `lockTime` is s.
export interface FcsTune {
  flat?: boolean; // true: measure the circle's angle and range on the level (x and z only), for the top-down camera; left out means 3D
  cone: number; // the aim circle's half-angle (deg); soft and hard use it, manual does not
  range: number; // the farthest a target may be from the mech's chest (m); every kind uses it
  spread: number; // how far a shot drifts inside its cone (deg); every kind uses it
  nearRange: number; // the distance inside which a target is aimed at directly and the spread shrinks (m)
  nearSpread: number; // the share of `spread` left at no distance (1 keeps the spread the same near and far)
  pull: number; // soft: how fast the aim turns toward the target (deg/s); the other kinds keep it 0
  lockTime: number; // hard: how long the target stays in the circle before it is caught (s); the other kinds keep it 0
  trackRate: number; // hard: how fast the muzzle follows a caught target (deg/s); the other kinds keep it 0
  breakCone: number; // hard: how far a caught target may drift from the aim before the lock breaks (deg); the other kinds keep it 0
}
