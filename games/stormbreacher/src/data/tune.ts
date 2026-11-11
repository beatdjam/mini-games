import type { CameraTune, FcsKind, FcsTune, MoveTune } from './tuneTypes.ts';

export type { CameraTune, FcsKind, FcsTune, MoveTune } from './tuneTypes.ts';

// Named values for the empty field: the ground, the fog, the camera and the box that shows a mech's size.
export const FIELD_TUNE = {
  groundSize: 400, // the ground plane's side (m)
  fogNear: 60, // where the fog starts (m)
  fogFar: 160, // where the fog hides everything (m)
  viewFar: 200, // the camera's far plane (m), past the fog's end
  camDist: 8.5, // the start camera's horizontal distance from the box (m)
  camHeight: 3, // the start camera's height above the box's middle (m)
  touchMaxFps: 60, // the frame cap on a phone (frames a second)
};

// The player's mech itself (D-24: 4 m tall). The tables below are written for this height.
export const MECH_TUNE = {
  height: 4, // the mech's height (m)
  radius: 1, // the hit radius on the ground (m)
  chestHeight: 2.5, // the height a shot starts from, above the feet (m)
};

// The third-person camera's starting values (SB-020). Distances are measured on the ground plane unless noted.
export const CAMERA_TUNE: CameraTune = {
  dist: 8.6, // the camera's horizontal distance from the look point (m)
  height: 1.5, // how far the camera sits above the look point (m)
  shoulder: 2.15, // how far the look point moves to the mech's right (m)
  lookHeight: 2.9, // the look point's height above the mech's feet (m)
  minDist: 0.5, // the shortest horizontal distance a wall may pull the camera to (m): near 0, so the camera stays on this side of any wall farther than this
  margin: 0.6, // the gap kept in front of a wall (m)
  pitchMin: -0.5, // the lowest pitch the camera may look, looking down (rad)
  pitchMax: 0.8, // the highest pitch the camera may look, looking up (rad)
  lag: 0.12, // the time constant for the camera to reach its target position (s); 0 means no lag
  fov: 72, // the vertical field of view (deg)
  aimDist: 5.1, // the camera's horizontal distance while aiming (m)
  aimFov: 52, // the vertical field of view while aiming (deg)
  walk: 7.4, // the model's walking speed in #view-camera (m/s)
};

// The mech's movement on flat ground (SB-025). Speeds are m/s, accelerations m/s^2.
export const MOVE_TUNE: MoveTune = {
  walk: 7.5, // the walking speed (m/s)
  stepHeight: 0.75, // the highest ledge the mech walks onto without a jump (m); provisional, SB-120's low obstacles settle it
  accel: 40, // how fast walking speeds up (m/s^2)
  decel: 90, // how fast the mech slows down with no input (m/s^2)
  jump: 7.2, // the upward speed a jump starts with (m/s)
  gravity: 25, // the downward pull in the air (m/s^2)
  airControl: 0.4, // the share of the walking acceleration that works in the air (0-1)
  boost: 15, // the boost's speed (m/s)
  boostAccel: 80, // how fast the boost speeds up (m/s^2)
  boostDrain: 0.5, // the gauge a second of boosting uses (gauge/s)
  boostRegen: 0.35, // the gauge a second on the ground gives back (gauge/s)
  hoverFall: 1.5, // the fastest a hover lets the mech fall (m/s)
  hoverDrain: 0.3, // the gauge a second of hovering uses (gauge/s)
  boostLift: 0, // the upward acceleration while boosting in the air (m/s^2); 0 falls while moving forward
  landStop: 0.12, // how long a landing stops the mech from walking (s)
  turn: 2.6, // how fast the turn keys change the yaw (rad/s)
  maxStep: 1 / 120, // the longest step a frame is split into (s)
};

// The feel of moving and firing (SB-025): camera and screen effects. Angles are in degrees, but only the FOV uses them.
export const FEEL_TUNE = {
  boostFov: 10, // how much wider the field of view gets while boosting (deg)
  fovRate: 8, // how fast the field of view reaches its target (1/s)
  landShake: 0.35, // the landing's shake at a falling speed of 10 m/s (m)
  fireShake: 0.06, // the shake a shot adds (m)
  shakeDecay: 10, // how fast the shake dies away (1/s)
  hitStop: 0.05, // how long a kill stops the mech (s); a plain hit does not (8 shots a second made it stutter)
  dust: 1, // the multiplier on how much dust a burst makes; 0 makes none
  fireRate: 8, // the shots a second while the fire key is held (shots/s)
};

export type FeelTune = typeof FEEL_TUNE;

// The game's own starting values (SB-115). The weapons' damage and range are in the weapon table (SB-140).
export const PLAY_TUNE = {
  startMargin: 4, // how far the mech starts inside the map's front edge (m)
};

// The starting values of each kind. The numbers decide nothing here: SB-060 compares them by hand.
export const FCS_TUNE: Record<FcsKind, FcsTune> = {
  manual: { cone: 0, range: 200, spread: 0.5, pull: 0, lockTime: 0, trackRate: 0, breakCone: 0 },
  soft: { cone: 8, range: 200, spread: 0.8, pull: 20, lockTime: 0, trackRate: 0, breakCone: 0 },
  hard: { cone: 12, range: 180, spread: 1.5, pull: 0, lockTime: 0.35, trackRate: 90, breakCone: 20 },
};

// The look and the battle effects of #view-fx (SB-045): the resolution and the colour, the shells near the mech, the
// smoke they leave, the tracers that cross the view, the allies walking landward and the planes overhead. The values
// are the middle of the three strengths; FX_STAGES turns them down or up. Colours are 0xRRGGBB.
export const FX_TUNE = {
  pixel: 0.4, // the share of the screen's pixels to draw (1 draws them all; the canvas is stretched back up)
  saturate: 0.61, // the CSS filter's saturation (1 leaves the colour as it is)
  contrast: 1.01, // the CSS filter's contrast (1 leaves it as it is)
  sepia: 0.16, // the CSS filter's sepia (0 leaves it as it is)
  haze: 0.25, // how far the fog's near side comes toward the camera (0 leaves it where #view-map has it)
  fogColor: 0x9aa9b0, // the fog's colour (0xRRGGBB)
  skyColor: 0x93a3ac, // the background's colour behind everything (0xRRGGBB)
  light: 0.6, // the multiplier on every light in the scene (1 leaves them as they are)
  sun: 1, // a further multiplier on the directional light (1 leaves it as it is)
  groundColor: 0x7a6a4f, // the ground tiles' colour (0xRRGGBB)

  shellEvery: 10, // seconds between two shells (0 makes none)
  shellNear: 17, // the nearest a shell falls from the mech (m)
  shellFar: 70, // the farthest a shell falls from the mech (m)
  shellShake: 0.14, // the shake a shell 10 m away adds (m); farther shells add less

  smokeLife: 5.5, // how long a shell's smoke stays (s)
  smokeCubes: 10, // the puffs one shell makes
  smokeMax: 270, // the most puffs drawn at once
  wreckSmoke: 3, // how many of the map's wrecks keep a column of smoke
  smokeColor: 0xb0aaa0, // a fresh puff's colour (0xRRGGBB)
  smokeDark: 0x3f3d3a, // a puff's colour just before it goes (0xRRGGBB)

  craters: 90, // the shell holes scattered over the map at the start (0 makes none)
  craterMin: 2.5, // the smallest hole's radius (m)
  craterMax: 8, // the largest hole's radius (m)
  craterWater: 0.2, // the share of holes with water in them (0 keeps them dry)
  shellCrater: 1, // whether a shell leaves a new hole (0 or 1)
  craterCap: 50, // the most holes a shell may add; the oldest goes when it is full

  tracers: 15, // the lines a second crossing the view (0 makes none)
  tracerSpeed: 80, // how fast a tracer flies (m/s)

  allies: 300, // the allies in the first wave (0 makes none)
  allyWaves: 5, // seconds between one wave and the next (0 makes no more waves)
  allySpeed: 2, // how fast an ally walks landward (m/s)
  allyDeathRate: 0.1, // the chance that one ally falls in a second (0 keeps them all up)

  planes: 8, // the planes in the air at once (0 makes none)
  planeHeight: 80, // how high a plane flies (m)
  planeSpeed: 30, // how fast a plane crosses (m/s)
};

export type FxTune = typeof FX_TUNE;

// What each strength changes; the rest stays as FX_TUNE. Stage 0 is #view-map's look with every effect off, so the two
// can be compared. Stage 2 is FX_TUNE itself.
const FX_OFF: Partial<FxTune> = {
  pixel: 1,
  saturate: 1,
  contrast: 1,
  sepia: 0,
  haze: 0,
  fogColor: 0x9db8c6,
  skyColor: 0x9db8c6,
  light: 1,
  sun: 1,
  groundColor: 0xc2a878,
  shellEvery: 0,
  shellShake: 0,
  smokeCubes: 0,
  smokeMax: 0,
  wreckSmoke: 0,
  craters: 0,
  shellCrater: 0,
  craterCap: 0,
  tracers: 0,
  allies: 0,
  allyWaves: 0,
  planes: 0,
};

const FX_WEAK: Partial<FxTune> = {
  pixel: 0.75,
  saturate: 0.85,
  contrast: 1,
  sepia: 0.05,
  haze: 0.12,
  fogColor: 0x9db2ba,
  skyColor: 0x9aadb6,
  light: 0.75,
  groundColor: 0x9a8660,
  shellEvery: 20,
  shellNear: 17,
  shellFar: 70,
  shellShake: 0.07,
  smokeLife: 5.5,
  smokeCubes: 5,
  smokeMax: 135,
  wreckSmoke: 2,
  craters: 45,
  craterMin: 2.5,
  craterMax: 8,
  craterWater: 0.1,
  shellCrater: 1,
  craterCap: 25,
  tracers: 7.5,
  tracerSpeed: 80,
  allies: 150,
  allyWaves: 10,
  allySpeed: 2,
  allyDeathRate: 0.05,
  planes: 4,
  planeHeight: 80,
  planeSpeed: 30,
};

const FX_STRONG: Partial<FxTune> = {
  pixel: 0.35,
  saturate: 0.45,
  contrast: 1.18,
  sepia: 0.25,
  haze: 0.45,
  fogColor: 0x8b959b,
  skyColor: 0x889399,
  light: 0.5,
  groundColor: 0x5f5340,
  shellEvery: 6.7,
  shellNear: 17,
  shellFar: 70,
  shellShake: 0.21,
  smokeLife: 5.5,
  smokeCubes: 15,
  smokeMax: 405,
  wreckSmoke: 5,
  craters: 135,
  craterMin: 2.5,
  craterMax: 8,
  craterWater: 0.3,
  shellCrater: 1,
  craterCap: 75,
  tracers: 22.5,
  tracerSpeed: 80,
  allies: 450,
  allyWaves: 3.3,
  allySpeed: 2,
  allyDeathRate: 0.15,
  planes: 12,
  planeHeight: 80,
  planeSpeed: 30,
};

// Stage 0 (off), 1 (weak), 2 (middle, FX_TUNE) and 3 (strong).
export const FX_STAGES: readonly FxTune[] = [
  { ...FX_TUNE, ...FX_OFF },
  { ...FX_TUNE, ...FX_WEAK },
  FX_TUNE,
  { ...FX_TUNE, ...FX_STRONG },
];

// The moving dummies of #view-fcs (SB-060). `hp` is the hits a dummy takes, `speed` is how fast it moves (m/s), and
// `respawn` is how long a downed dummy stays down (s).
export const DUMMY_TUNE = {
  hp: 10, // hits needed to down a dummy
  speed: 8, // how fast a moving dummy travels (m/s)
  respawn: 1.5, // how long after a down a dummy comes back (s)
};

export type DummyTune = typeof DUMMY_TUNE;
