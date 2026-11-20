// The beach's infantry droids (SB-1745, second pass SB-1747, three views SB-2084, near form SB-2085): a slim humanoid of
// armour plates, thin joints and a faceted sensor head, built with the shapes of SB-1468 and the face language of SB-1469
// and SB-1471 (tapered plates, a diagonal cut, two paints and an accent, thin light lines, a stance with the knees bent and
// the torso forward). SB-2084 gives them the three views' small machine: the three eyes, the short rifle held across the
// chest and the low pack with its lit vents. SB-2085 gives the beach's own side their colours back and splits the shapes in
// two: a close form of about 3,700 triangles with layered armour, round joints, a detailed rifle and pack, and the old
// 796-triangle form for the crowd at a distance. The body carries the neck up to the head's base, so the two never come
// apart; the rifle is held across the chest with both hands, along x, so a droid that lies on its back keeps the barrel off
// the sand. The shapes are in metres from the body's own middle (SOLDIER_POSE.bodyY) or the head's (SOLDIER_POSE.headY) in
// data/soldiers.ts. Every value here is provisional.
import type { Vec3 } from './mech.ts';

export type DroidMaterial = 'armor' | 'frame' | 'accent' | 'glow';

// How a plate is bent away from its box (view/mechShapes.ts's plateGeometry): its width at the top and the bottom, at
// the front and the back, a wedge's shorter front, a front edge that drops, and a cut on one side.
export interface DroidPlateTaper {
  top?: number;
  bottom?: number;
  front?: number;
  back?: number;
  nose?: number;
  drop?: number;
  cut?: number;
  cutSide?: 'left' | 'right';
}

// The kinds of shape a droid is made of. A plate is a chamfered, bent box; a box is a plain low shape (the frame, the
// limbs and the small markings); a tube is a round joint; a ring is a round rim with a hole, as on a muzzle or a knee.
// Only the fields a kind uses are written.
export type DroidShapeKind = 'plate' | 'box' | 'tube' | 'ring';

export interface DroidShape {
  kind: DroidShapeKind;
  material: DroidMaterial;
  at: Vec3; // the centre, in metres from the part's own centre
  size?: Vec3; // plate and box: width, height and depth
  bevel?: number; // plate: the chamfer (DROID_TUNE.bevel when left out)
  taper?: DroidPlateTaper; // plate: the bend from the plain box
  radius?: number; // tube and ring: the radius
  length?: number; // tube: end to end along its axis
  tube?: number; // ring: the thickness of the ring itself
  axis?: 'x' | 'y' | 'z'; // tube and ring: the axis they run along (y when left out)
  rot?: Vec3; // the turn about x, y and z, in radians, before the shape is put at `at`
  mirror?: boolean; // also draw the shape mirrored in x (a leg, a shoulder)
}

// How much of a droid is drawn: `near` is the close form of the single droid and the riders, `far` the light form the crowd
// keeps at a distance (SB-2085).
export type DroidDetail = 'near' | 'far';

// The droid's size, the look of its plates and the distance from the camera at which a droid takes the close form. The body
// is 1.56 m tall from the soles to the top of the head, as the humans it replaces were: the pose's body and head heights
// (SOLDIER_POSE) still hold.
export const DROID_TUNE = {
  height: 1.56, // metres from the soles to the top of the head
  bevel: 0.007, // a plate's chamfer when it names none (m)
  bevelSegments: 1, // layers in a chamfer
  roundSegments: 8, // a tube's sides on the far form
  nearRoundSegments: 12, // a tube's or ring's sides on the close form
  nearDistance: 25, // m from the camera within which a soldier takes the close form
  nearCap: 48, // the most soldiers in the close form at once
} as const;

// A limb or a joint line from one joint to another: the box (or plate) is centred between them and turned so its long
// axis, local +y, runs from `from` to `to`. Every segment is written from the lower joint up, so a plate's taper keeps
// its top toward the body. `length` is the distance between the joints (m), before `shrink`; `bias` slides the piece
// toward `to` (a positive bias leaves the lower joint showing).
interface DroidSegment {
  at: Vec3;
  rot: Vec3;
  length: number;
}

function between(from: Vec3, to: Vec3, shrink = 1, bias = 0): DroidSegment {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  const mid = 0.5 + bias;
  // turn local +y onto the direction: first about z, then about x (Euler XYZ)
  return {
    at: [from[0] + dx * mid, from[1] + dy * mid, from[2] + dz * mid],
    rot: [Math.atan2(dz, dy), 0, -Math.asin(dx / length)],
    length: length * shrink,
  };
}

// Where the limbs bend, in metres from the body's middle. The right leg is the one a step ahead; both knees are bent
// forward and the feet stay under the hips, so the stance reads as a run and the body can lie down without a foot
// standing out of the sand. The hands hold the rifle across the chest (front is -z, right is +x).
export const DROID_JOINTS = {
  right: {
    hip: [0.105, 0.07, 0.02],
    knee: [0.12, -0.23, -0.1],
    ankle: [0.11, -0.55, -0.06],
    foot: [0.11, -0.595, -0.12],
    shoulder: [0.215, 0.465, -0.065],
    elbow: [0.29, 0.27, -0.12],
    hand: [0.1, 0.29, -0.21],
  },
  left: {
    hip: [-0.105, 0.07, 0.02],
    knee: [-0.12, -0.23, -0.1],
    ankle: [-0.11, -0.55, 0.04],
    foot: [-0.11, -0.595, 0.04],
    shoulder: [-0.215, 0.465, -0.065],
    elbow: [-0.29, 0.27, -0.12],
    hand: [-0.255, 0.29, -0.205],
  },
} as const;

const THIGH_R = between(DROID_JOINTS.right.knee, DROID_JOINTS.right.hip, 0.76, 0.12);
const THIGH_L = between(DROID_JOINTS.left.knee, DROID_JOINTS.left.hip, 0.76, 0.12);
const SHIN_R = between(DROID_JOINTS.right.ankle, DROID_JOINTS.right.knee);
const SHIN_L = between(DROID_JOINTS.left.ankle, DROID_JOINTS.left.knee);
const UPPER_R = between(DROID_JOINTS.right.elbow, DROID_JOINTS.right.shoulder);
const UPPER_L = between(DROID_JOINTS.left.elbow, DROID_JOINTS.left.shoulder);
const FOREARM_R = between(DROID_JOINTS.right.hand, DROID_JOINTS.right.elbow);
const FOREARM_L = between(DROID_JOINTS.left.hand, DROID_JOINTS.left.elbow);

// The thigh's armour: a long plate that narrows to the knee, with the outer top cut in, so the pair reads as two thin
// legs under a wide chest. The left plate mirrors the right's cut.
const THIGH_TAPER: DroidPlateTaper = { top: 1.18, front: 0.88, nose: 0.88, cut: 0.12, cutSide: 'right' };
const THIGH_TAPER_L: DroidPlateTaper = { ...THIGH_TAPER, cutSide: 'left' };

// The close form: layered armour on the chest and the waist, round joints, plated thighs, shins and feet, a sensor head
// with the three eyes, an antenna and side discs, the short rifle with its barrel, magazine and sight, and the pack with
// its vents, thrusters and antenna. It makes about 3,700 triangles a droid (SB-2085).
const NEAR_BODY: readonly DroidShape[] = [
  // the pelvis: a dark core under a layered front plate, with a hip plate on each side and an accent belt
  { kind: 'box', material: 'frame', size: [0.2, 0.12, 0.15], at: [0, 0.075, 0.005] },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.21, 0.1, 0.055],
    at: [0, 0.08, -0.07],
    taper: { top: 1.05, bottom: 0.9, front: 0.9, nose: 0.85, drop: 0.04 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.065, 0.12, 0.13],
    at: [0.115, 0.075, 0.005],
    taper: { top: 0.85, nose: 0.85 },
    mirror: true,
  },
  { kind: 'box', material: 'accent', size: [0.11, 0.02, 0.014], at: [0, 0.11, -0.101] },
  // the waist: a dark block inside a round joint, under a plated abdomen with a lit vent on each side
  { kind: 'box', material: 'frame', size: [0.13, 0.12, 0.11], at: [0, 0.2, 0] },
  { kind: 'tube', material: 'frame', radius: 0.07, length: 0.09, at: [0, 0.2, 0] },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.2, 0.12, 0.16],
    at: [0, 0.26, -0.005],
    taper: { top: 1.1, front: 0.9, nose: 0.9 },
  },
  { kind: 'box', material: 'glow', size: [0.014, 0.05, 0.012], at: [0.085, 0.26, -0.085], mirror: true },
  // the chest: the main plate under a top plate and a plate on each side, over a dark back, leaning into the run
  {
    kind: 'plate',
    material: 'armor',
    size: [0.26, 0.27, 0.2],
    at: [0, 0.37, -0.045],
    bevel: 0.009,
    rot: [-0.2, 0, 0],
    taper: { top: 1.1, front: 0.8, nose: 0.84, drop: 0.04 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.2, 0.12, 0.055],
    at: [0, 0.43, -0.15],
    rot: [-0.2, 0, 0],
    taper: { top: 1.08, front: 0.85, nose: 0.8, drop: 0.04 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.06, 0.2, 0.16],
    at: [0.145, 0.37, -0.03],
    rot: [-0.15, 0, -0.06],
    taper: { top: 0.8, front: 0.9, nose: 0.85 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.18, 0.23, 0.06],
    at: [0, 0.35, 0.135],
    taper: { top: 1.02, front: 0.9, nose: 0.9 },
  },
  // the lit window in the chest, with an accent line above it
  { kind: 'box', material: 'glow', size: [0.075, 0.026, 0.014], at: [0, 0.44, -0.17] },
  { kind: 'box', material: 'accent', size: [0.09, 0.008, 0.014], at: [0, 0.458, -0.168] },
  // the short dark neck that reaches up into the head's base, inside a collar ring
  { kind: 'tube', material: 'frame', radius: 0.045, length: 0.15, at: [0, 0.55, -0.07], rot: [0.3, 0, 0] },
  { kind: 'ring', material: 'frame', radius: 0.06, tube: 0.012, at: [0, 0.525, -0.062], rot: [0.3, 0, 0] },
  // the shoulder bar, the small cut pauldrons over it, and the round shoulder joints
  { kind: 'tube', material: 'frame', axis: 'x', radius: 0.035, length: 0.31, at: [0, 0.47, -0.07] },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.14, 0.13, 0.17],
    at: [0.22, 0.49, -0.06],
    rot: [-0.1, 0, -0.12],
    taper: { top: 0.8, front: 0.72, nose: 0.55, cut: 0.3, cutSide: 'right' },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.11, 0.07, 0.14],
    at: [0.23, 0.545, -0.06],
    rot: [-0.1, 0, -0.12],
    taper: { top: 0.75, front: 0.8, nose: 0.7 },
    mirror: true,
  },
  {
    kind: 'tube',
    material: 'frame',
    axis: 'x',
    radius: 0.04,
    length: 0.11,
    at: DROID_JOINTS.right.shoulder,
    mirror: true,
  },
  // the arms: thin frames under plated upper arms and forearms, round elbows and simple hands
  { kind: 'box', material: 'frame', size: [0.045, UPPER_R.length, 0.05], at: UPPER_R.at, rot: UPPER_R.rot },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.07, UPPER_R.length * 0.82, 0.08],
    at: UPPER_R.at,
    rot: UPPER_R.rot,
    taper: { top: 0.9, front: 0.85, nose: 0.85 },
  },
  { kind: 'box', material: 'frame', size: [0.045, UPPER_L.length, 0.05], at: UPPER_L.at, rot: UPPER_L.rot },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.07, UPPER_L.length * 0.82, 0.08],
    at: UPPER_L.at,
    rot: UPPER_L.rot,
    taper: { top: 0.9, front: 0.85, nose: 0.85 },
  },
  {
    kind: 'tube',
    material: 'frame',
    axis: 'x',
    radius: 0.033,
    length: 0.08,
    at: DROID_JOINTS.right.elbow,
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.06, FOREARM_R.length, 0.07],
    at: FOREARM_R.at,
    rot: FOREARM_R.rot,
    taper: { top: 0.9, front: 0.85, nose: 0.85 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.06, FOREARM_L.length, 0.07],
    at: FOREARM_L.at,
    rot: FOREARM_L.rot,
    taper: { top: 0.9, front: 0.85, nose: 0.85 },
  },
  { kind: 'box', material: 'frame', size: [0.055, 0.055, 0.06], at: DROID_JOINTS.right.hand },
  { kind: 'box', material: 'frame', size: [0.055, 0.055, 0.06], at: DROID_JOINTS.left.hand },
  // the legs: round hips and knees, plated thighs and shins over thin frames, and long feet
  {
    kind: 'tube',
    material: 'frame',
    axis: 'x',
    radius: 0.04,
    length: 0.12,
    at: DROID_JOINTS.right.hip,
    mirror: true,
  },
  { kind: 'box', material: 'frame', size: [0.05, THIGH_R.length * 0.95, 0.055], at: THIGH_R.at, rot: THIGH_R.rot },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.11, THIGH_R.length, 0.13],
    at: THIGH_R.at,
    rot: THIGH_R.rot,
    taper: THIGH_TAPER,
  },
  { kind: 'box', material: 'frame', size: [0.05, THIGH_L.length * 0.95, 0.055], at: THIGH_L.at, rot: THIGH_L.rot },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.11, THIGH_L.length, 0.13],
    at: THIGH_L.at,
    rot: THIGH_L.rot,
    taper: THIGH_TAPER_L,
  },
  {
    kind: 'tube',
    material: 'accent',
    axis: 'x',
    radius: 0.045,
    length: 0.11,
    at: DROID_JOINTS.right.knee,
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.09, 0.09, 0.08],
    at: [DROID_JOINTS.right.knee[0], DROID_JOINTS.right.knee[1], DROID_JOINTS.right.knee[2] - 0.055],
    rot: THIGH_R.rot,
    taper: { top: 0.8, front: 0.75, nose: 0.7 },
    mirror: true,
  },
  { kind: 'box', material: 'frame', size: [0.06, SHIN_R.length, 0.07], at: SHIN_R.at, rot: SHIN_R.rot },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.09, SHIN_R.length * 0.92, 0.1],
    at: SHIN_R.at,
    rot: SHIN_R.rot,
    taper: { top: 0.95, front: 0.85, nose: 0.85 },
  },
  { kind: 'box', material: 'frame', size: [0.06, SHIN_L.length, 0.07], at: SHIN_L.at, rot: SHIN_L.rot },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.09, SHIN_L.length * 0.92, 0.1],
    at: SHIN_L.at,
    rot: SHIN_L.rot,
    taper: { top: 0.95, front: 0.85, nose: 0.85 },
  },
  {
    kind: 'tube',
    material: 'frame',
    axis: 'x',
    radius: 0.033,
    length: 0.09,
    at: DROID_JOINTS.right.ankle,
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.12, 0.05, 0.26],
    at: DROID_JOINTS.right.foot,
    taper: { front: 0.78, nose: 0.75 },
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.12, 0.05, 0.26],
    at: DROID_JOINTS.left.foot,
    taper: { front: 0.78, nose: 0.75 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.11, 0.045, 0.1],
    at: [DROID_JOINTS.right.foot[0], DROID_JOINTS.right.foot[1] + 0.012, DROID_JOINTS.right.foot[2] - 0.1],
    taper: { front: 0.7, nose: 0.65, drop: 0.08 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.11, 0.045, 0.1],
    at: [DROID_JOINTS.left.foot[0], DROID_JOINTS.left.foot[1] + 0.012, DROID_JOINTS.left.foot[2] - 0.1],
    taper: { front: 0.7, nose: 0.65, drop: 0.08 },
  },
  {
    kind: 'box',
    material: 'glow',
    size: [0.06, 0.008, 0.015],
    at: [DROID_JOINTS.right.foot[0], DROID_JOINTS.right.foot[1] + 0.035, DROID_JOINTS.right.foot[2] - 0.22],
  },
  {
    kind: 'box',
    material: 'glow',
    size: [0.06, 0.008, 0.015],
    at: [DROID_JOINTS.left.foot[0], DROID_JOINTS.left.foot[1] + 0.035, DROID_JOINTS.left.foot[2] - 0.22],
  },
  { kind: 'box', material: 'frame', size: [0.08, 0.05, 0.07], at: [DROID_JOINTS.right.foot[0], -0.585, -0.03] },
  { kind: 'box', material: 'frame', size: [0.08, 0.05, 0.07], at: [DROID_JOINTS.left.foot[0], -0.585, 0.13] },
  // the low pack: a dark box under an armour plate, a lit vent on each side, two short thrusters and an antenna
  { kind: 'box', material: 'frame', size: [0.2, 0.18, 0.06], at: [0, 0.36, 0.16] },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.22, 0.12, 0.05],
    at: [0, 0.39, 0.185],
    taper: { top: 0.9, front: 0.9, nose: 0.85 },
  },
  { kind: 'box', material: 'glow', size: [0.02, 0.08, 0.012], at: [0.05, 0.39, 0.215], mirror: true },
  {
    kind: 'tube',
    material: 'frame',
    axis: 'z',
    radius: 0.025,
    length: 0.05,
    at: [0.07, 0.31, 0.215],
    mirror: true,
  },
  { kind: 'tube', material: 'frame', radius: 0.008, length: 0.16, at: [0.09, 0.47, 0.17] },
  { kind: 'box', material: 'glow', size: [0.018, 0.018, 0.018], at: [0.09, 0.555, 0.17] },
  // the short rifle: a plated receiver and stock, a tube barrel with a muzzle ring, a magazine, a sight and grips, held
  // across the chest
  {
    kind: 'plate',
    material: 'armor',
    size: [0.19, 0.09, 0.06],
    at: [0.03, 0.29, -0.21],
    taper: { top: 0.9, front: 0.85, nose: 0.85 },
  },
  { kind: 'tube', material: 'frame', axis: 'x', radius: 0.018, length: 0.24, at: [-0.16, 0.295, -0.21] },
  { kind: 'ring', material: 'accent', axis: 'x', radius: 0.026, tube: 0.008, at: [-0.285, 0.295, -0.21] },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.08, 0.07, 0.055],
    at: [0.16, 0.285, -0.205],
    taper: { top: 0.8, front: 0.85, nose: 0.8 },
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.04, 0.12, 0.05],
    at: [0.03, 0.215, -0.21],
    taper: { top: 0.9, front: 0.85, nose: 0.8 },
  },
  { kind: 'tube', material: 'frame', axis: 'x', radius: 0.014, length: 0.06, at: [0.06, 0.34, -0.205] },
  { kind: 'box', material: 'glow', size: [0.012, 0.012, 0.012], at: [0.092, 0.34, -0.205] },
  { kind: 'box', material: 'frame', size: [0.035, 0.06, 0.04], at: [-0.02, 0.225, -0.205] },
  { kind: 'box', material: 'frame', size: [0.03, 0.05, 0.035], at: [-0.12, 0.25, -0.21] },
];

// The head: a faceted sensor box under a brow and a face plate, the three lit eyes on its front, an antenna and a round
// sensor on each side, and a collar ring at the neck. Its top is the 1.56 m the humans stood (SB-2084, SB-2085).
const NEAR_HEAD: readonly DroidShape[] = [
  {
    kind: 'plate',
    material: 'armor',
    size: [0.3, 0.3, 0.24],
    at: [0, 0.05, 0],
    bevel: 0.01,
    taper: { top: 0.82, front: 0.8, nose: 0.72, drop: 0.04 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.24, 0.2, 0.055],
    at: [0, 0.055, -0.14],
    taper: { top: 0.9, front: 0.82, nose: 0.8, drop: 0.02 },
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.22, 0.05, 0.1],
    at: [0, 0.155, -0.08],
    taper: { top: 0.85, front: 0.85, nose: 0.8 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.05, 0.12, 0.14],
    at: [0.13, 0.03, -0.03],
    taper: { top: 0.8, front: 0.85, nose: 0.8 },
    mirror: true,
  },
  { kind: 'box', material: 'glow', size: [0.04, 0.032, 0.014], at: [0, 0.085, -0.172] },
  { kind: 'box', material: 'glow', size: [0.03, 0.024, 0.014], at: [0.052, 0.035, -0.169], mirror: true },
  { kind: 'tube', material: 'frame', radius: 0.007, length: 0.12, at: [-0.12, 0.13, 0.02] },
  { kind: 'box', material: 'glow', size: [0.018, 0.018, 0.018], at: [-0.12, 0.19, 0.02] },
  {
    kind: 'tube',
    material: 'frame',
    axis: 'x',
    radius: 0.028,
    length: 0.035,
    at: [0.15, 0.06, 0],
    mirror: true,
  },
  { kind: 'ring', material: 'frame', radius: 0.07, tube: 0.012, at: [0, -0.075, 0] },
];

// The far form: the 2084 shapes at their old weight (the body 700 triangles and the head 96), kept for the crowd. Its
// limbs, shins and feet take the close form's widths so the outline matches; only the colours and those widths change
// with SB-2085.
const FAR_BODY: readonly DroidShape[] = [
  // the pelvis: a dark block with an accent band across its front, under a narrow dark waist
  { kind: 'box', material: 'frame', size: [0.2, 0.12, 0.15], at: [0, 0.075, 0.005] },
  { kind: 'box', material: 'accent', size: [0.11, 0.02, 0.012], at: [0, 0.1, -0.077] },
  { kind: 'box', material: 'frame', size: [0.13, 0.13, 0.11], at: [0, 0.2, 0] },
  // the chest: one narrow plate that narrows and drops toward the front, over a dark back, leaning into the run
  {
    kind: 'plate',
    material: 'armor',
    size: [0.26, 0.27, 0.2],
    at: [0, 0.37, -0.045],
    bevel: 0.009,
    rot: [-0.2, 0, 0],
    taper: { top: 1.1, front: 0.8, nose: 0.84, drop: 0.04 },
  },
  { kind: 'box', material: 'frame', size: [0.17, 0.23, 0.09], at: [0, 0.35, 0.095] },
  // the lit window in the chest
  { kind: 'box', material: 'glow', size: [0.07, 0.024, 0.012], at: [0, 0.44, -0.163] },
  // the collar on the chest's top and the short dark neck that reaches up into the head's base
  { kind: 'box', material: 'armor', size: [0.13, 0.04, 0.11], at: [0, 0.515, -0.065] },
  { kind: 'box', material: 'frame', size: [0.09, 0.16, 0.095], at: [0, 0.55, -0.07], rot: [0.3, 0, 0] },
  // the shoulder bar and the small cut pauldrons over it
  { kind: 'box', material: 'frame', size: [0.31, 0.045, 0.075], at: [0, 0.47, -0.07] },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.14, 0.12, 0.16],
    at: [0.22, 0.49, -0.06],
    rot: [-0.1, 0, -0.12],
    taper: { top: 0.8, front: 0.72, nose: 0.55, cut: 0.3, cutSide: 'right' },
    mirror: true,
  },
  // the low pack with a lit slit on each side
  { kind: 'box', material: 'frame', size: [0.2, 0.18, 0.06], at: [0, 0.36, 0.16] },
  { kind: 'box', material: 'armor', size: [0.22, 0.12, 0.05], at: [0, 0.39, 0.185] },
  { kind: 'box', material: 'glow', size: [0.02, 0.08, 0.012], at: [0.05, 0.39, 0.215], mirror: true },
  // the thighs: long narrow armour plates over thin frames, with a drum at each knee
  {
    kind: 'plate',
    material: 'armor',
    size: [0.11, THIGH_R.length, 0.13],
    at: THIGH_R.at,
    rot: THIGH_R.rot,
    taper: THIGH_TAPER,
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.11, THIGH_L.length, 0.13],
    at: THIGH_L.at,
    rot: THIGH_L.rot,
    taper: THIGH_TAPER_L,
  },
  {
    kind: 'tube',
    material: 'accent',
    axis: 'x',
    radius: 0.045,
    length: 0.11,
    at: DROID_JOINTS.right.knee,
  },
  {
    kind: 'tube',
    material: 'accent',
    axis: 'x',
    radius: 0.045,
    length: 0.11,
    at: DROID_JOINTS.left.knee,
  },
  // the shins and the low feet
  { kind: 'box', material: 'frame', size: [0.09, SHIN_R.length, 0.1], at: SHIN_R.at, rot: SHIN_R.rot },
  { kind: 'box', material: 'frame', size: [0.09, SHIN_L.length, 0.1], at: SHIN_L.at, rot: SHIN_L.rot },
  { kind: 'box', material: 'frame', size: [0.12, 0.05, 0.26], at: DROID_JOINTS.right.foot },
  { kind: 'box', material: 'frame', size: [0.12, 0.05, 0.26], at: DROID_JOINTS.left.foot },
  // the arms: thin upper arms from the shoulders, dark elbows and light forearms coming in to the rifle
  { kind: 'box', material: 'frame', size: [0.06, UPPER_R.length, 0.065], at: UPPER_R.at, rot: UPPER_R.rot },
  { kind: 'box', material: 'frame', size: [0.06, UPPER_L.length, 0.065], at: UPPER_L.at, rot: UPPER_L.rot },
  { kind: 'box', material: 'frame', size: [0.07, 0.07, 0.07], at: DROID_JOINTS.right.elbow },
  { kind: 'box', material: 'frame', size: [0.07, 0.07, 0.07], at: DROID_JOINTS.left.elbow },
  // the forearms and hands
  {
    kind: 'box',
    material: 'armor',
    size: [0.06, FOREARM_R.length, 0.065],
    at: FOREARM_R.at,
    rot: FOREARM_R.rot,
  },
  {
    kind: 'box',
    material: 'armor',
    size: [0.06, FOREARM_L.length, 0.065],
    at: FOREARM_L.at,
    rot: FOREARM_L.rot,
  },
  { kind: 'box', material: 'frame', size: [0.06, 0.06, 0.065], at: DROID_JOINTS.right.hand },
  { kind: 'box', material: 'frame', size: [0.06, 0.06, 0.065], at: DROID_JOINTS.left.hand },
  // the short rifle: a light receiver and stock, a dark barrel and magazine, held across the chest
  { kind: 'box', material: 'armor', size: [0.19, 0.09, 0.06], at: [0.03, 0.29, -0.21] },
  { kind: 'box', material: 'frame', size: [0.22, 0.04, 0.04], at: [-0.14, 0.295, -0.21] },
  { kind: 'box', material: 'armor', size: [0.09, 0.07, 0.055], at: [0.16, 0.285, -0.205] },
  { kind: 'box', material: 'frame', size: [0.04, 0.12, 0.05], at: [0.03, 0.215, -0.21] },
];

const FAR_HEAD: readonly DroidShape[] = [
  // the head: a faceted sensor box with the three lit eyes on its front; its top is the 1.56 m the humans stood
  {
    kind: 'plate',
    material: 'armor',
    size: [0.3, 0.3, 0.24],
    at: [0, 0.05, 0],
    bevel: 0.01,
    taper: { top: 0.82, front: 0.8, nose: 0.72, drop: 0.04 },
  },
  { kind: 'box', material: 'glow', size: [0.04, 0.032, 0.014], at: [0, 0.075, -0.128] },
  { kind: 'box', material: 'glow', size: [0.03, 0.024, 0.014], at: [0.052, 0.03, -0.125], mirror: true },
];

export const DROID_PARTS: Record<DroidDetail, { body: readonly DroidShape[]; head: readonly DroidShape[] }> = {
  near: { body: NEAR_BODY, head: NEAR_HEAD },
  far: { body: FAR_BODY, head: FAR_HEAD },
};
