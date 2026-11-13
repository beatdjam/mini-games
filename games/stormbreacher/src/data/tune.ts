import type { GaitKind } from './mech.ts';
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
  muzzleSide: 0.9, // how far right of the mech's centre the weapon arm's muzzle sits (m): the arm's mount in data/mech.ts, kept inside the radius
  muzzleForward: 0.4, // how far in front of the mech's centre the muzzle sits (m)
  armor: 200, // the damage the mech takes before it is downed (SB-190; provisional)
  fadeDist: 3.5, // the camera nearer than this to the mech's chest (m) draws the mech see-through
  fadeOpacity: 0.35, // the mech's opacity while see-through
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
  jump: 9.4, // the upward speed a jump starts with (m/s)
  gravity: 20, // the downward pull in the air (m/s^2)
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

// What each kind of legs changes in MOVE_TUNE (SB-130's third card; provisional). Only the items that differ are
// written; the biped is the standard and changes none. The mech's own table is made by moveTuneOf (logic/mechTune.ts).
export const LEG_MOVE_TUNE: Record<GaitKind, Partial<MoveTune>> = {
  biped: {},
  reverse: { walk: 8.5, accel: 44, jump: 10.4, boostDrain: 0.42, stepHeight: 0.6 }, // fast, jumps high, boosts long
  multi: { walk: 6.2, jump: 7.05, stepHeight: 0.6 }, // slow, jumps low
};

// How the mech's body moves while it walks, boosts, jumps and fires (SB-130's third card; view only, provisional).
// Lengths are ratios of the mech's height.
export const MOTION_TUNE = {
  walkSpeed: 6, // the speed at which the legs swing fully (m/s)
  idleSpeed: 0.3, // below this speed the legs stand (m/s)
  walkRate: 6, // how fast the swing grows and dies away (1/s)
  airRate: 12, // how fast the legs tuck and come back (1/s)
  boostRate: 8, // how fast the lean and the flame come and go (1/s)
  lean: 0.2, // how far the body leans forward while boosting (rad)
  flameLength: 0.22, // the flame's length at full boost
  flameSize: 0.035, // the flame's width and height
  flameShow: 0.02, // the flame is drawn above this share of full boost
  recoilBack: 0.06, // how far a shot pulls the arms back
  recoilTime: 0.16, // how long the arms take to come back (s)
  landDip: 0.05, // how far a landing at landSpeed sinks the body
  landSpeed: 10, // the falling speed that sinks the body fully (m/s)
  landTime: 0.2, // how long the body takes to come back up (s)
};

// The feel of moving and firing (SB-025): camera and screen effects. Angles are in degrees, but only the FOV uses them.
export const FEEL_TUNE = {
  boostFov: 10, // how much wider the field of view gets while boosting (deg)
  fovRate: 8, // how fast the field of view reaches its target (1/s)
  landShake: 0.35, // the landing's shake at a falling speed of 10 m/s (m)
  fireShake: 0.06, // the shake a shot adds (m)
  damageShake: 0.2, // the shake a hit on the mech adds (m)
  shakeMax: 0.9, // the most a frame's shake may reach when blasts add to it (m; the biggest blast 0.7 plus a hit's 0.2)
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

// The HUD's values (SB-160). All provisional.
export const HUD_TUNE = {
  radarRange: 200, // how far the radar sees (m); a target farther than this is not drawn
};

// The signs of being under fire (SB-1380): the red edge a hit from a direction lights, the white flash of a blast close
// by, and the dark, drained edge while the armour is low. Colours are 0xRRGGBB and shares are 0-1. All provisional,
// settled by eye in #view-hurt.
export const HURT_TUNE = {
  edgeColor: 0xff2a1a, // the edge's colour (0xRRGGBB)
  edgeAlpha: 0.55, // the strongest a lit edge gets (0-1)
  edgeWidth: 0.28, // how far the glow reaches in, as a share of the screen's farthest side from its anchor (0-1)
  edgeFade: 0.8, // how long a hit's glow takes to go (s)
  flashColor: 0xffffff, // the white flash's colour (0xRRGGBB)
  flashAlpha: 0.35, // the flash at 0m from the mech (0-1)
  flashNear: 15, // a blast closer than this whitens the screen (m)
  flashFade: 0.3, // how long the white takes to go (s)
  armorDarkFrom: 0.5, // the armour's share below which the edge darkens (1 = full armour)
  armorDarkMax: 0.7, // the edge's darkness at no armour (0-1)
  armorDrain: 0.45, // the share of the colour the screen loses at no armour (0-1)
  armorColor: 0x000000, // the darkening edge's colour (0xRRGGBB)
};

export type HurtTune = typeof HURT_TUNE;

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

  allies: 300, // the allies in each wave (0 makes none)
  allyWaves: 5, // seconds between one wave and the next (0 makes no more waves)
  allySpeed: 2, // how fast an ally walks landward (m/s)
  allyDeathRate: 0.1, // the chance that one ally falls in a second (0 keeps them all up)

  squads: 0, // the squads in a wave (0 keeps the old scatter)
  squad: 0, // the soldiers in one squad (0 keeps the old scatter)
  squadFallShare: 0, // the share of a squad that falls at the machine-gun nests (0-1; 0 keeps them up)
  squadFallRadius: 0, // how near a machine-gun nest a squad falls (m; 0 keeps them up)
  shellFallRadius: 0, // a shell this near a soldier may make it fall (m; 0 keeps them up)
  shellFallShare: 0, // the chance that a soldier inside shellFallRadius falls (0-1; 0 keeps them up)

  planes: 8, // the planes in the air at once (0 makes none)
  planeHeight: 80, // how high a plane flies (m)
  planeSpeed: 30, // how fast a plane crosses (m/s)
};

export type FxTune = typeof FX_TUNE;

// The battle layer of the main sortie. #view-fx keeps FX_TUNE, so the tools can still compare 150/300/450.
export const BATTLE_TUNE = {
  allies: 20, // the allies in each wave of the main sortie (0 makes none)
  allyWaves: 10, // seconds between one wave and the next (s)
  allySpeed: 3.5, // how fast an ally walks landward (m/s)
  allyDeathRate: 0.03, // the chance that one ally falls in a second (0 keeps them all up)
  squads: 2, // the squads that walk on a machine-gun nest; the rest of the wave comes in scattered
  squad: 5, // the soldiers in one squad
  squadFallShare: 0.4, // the share of a squad that falls at the nest it walks on (0-1)
  squadFallRadius: 10, // how near a machine-gun nest a squad falls (m)
  shellFallRadius: 10, // a shell this near a soldier may make it fall (m)
  shellFallShare: 0.5, // the chance that a soldier inside shellFallRadius falls (0-1)
  // The z the allies wait at until the pillboxes are down. It sits 5 m seaward of the pillboxes' boxes (z -19..-11), so
  // they stop just short of the line. A guess, to be judged on the screen.
  holdZ: -6,
};

// Only FxTune's own values: BATTLE_TUNE.holdZ is the view's and must not ride along in the look. All provisional.
export const PLAY_BATTLE_TUNE: FxTune = {
  ...FX_TUNE,
  allies: BATTLE_TUNE.allies,
  allyWaves: BATTLE_TUNE.allyWaves,
  allySpeed: BATTLE_TUNE.allySpeed,
  allyDeathRate: BATTLE_TUNE.allyDeathRate,
  squads: BATTLE_TUNE.squads,
  squad: BATTLE_TUNE.squad,
  squadFallShare: BATTLE_TUNE.squadFallShare,
  squadFallRadius: BATTLE_TUNE.squadFallRadius,
  shellFallRadius: BATTLE_TUNE.shellFallRadius,
  shellFallShare: BATTLE_TUNE.shellFallShare,
};

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
