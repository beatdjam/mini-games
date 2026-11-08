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
