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
