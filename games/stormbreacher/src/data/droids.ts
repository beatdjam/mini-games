// The beach's infantry droids (SB-1745, second pass SB-1747): a slim humanoid of armour plates, thin joints and a box
// sensor head, built with the shapes of SB-1468 and the face language of SB-1469 and SB-1471 (tapered plates, a diagonal
// cut, two paints and an accent, thin light lines, a stance with the knees bent and the torso forward). The body carries
// the neck up to the head's base, so the two never come apart; the rifle is held across the chest with both hands, along
// x, so a droid that lies on its back keeps the barrel off the sand. The shapes are in metres from the body's own middle
// (SOLDIER_POSE.bodyY) or the head's (SOLDIER_POSE.headY) in data/soldiers.ts. Every value here is provisional.
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
// limbs and the small markings); a tube is a round joint. Only the fields a kind uses are written.
export type DroidShapeKind = 'plate' | 'box' | 'tube';

export interface DroidShape {
  kind: DroidShapeKind;
  material: DroidMaterial;
  at: Vec3; // the centre, in metres from the part's own centre
  size?: Vec3; // plate and box: width, height and depth
  bevel?: number; // plate: the chamfer (DROID_TUNE.bevel when left out)
  taper?: DroidPlateTaper; // plate: the bend from the plain box
  radius?: number; // tube: the radius
  length?: number; // tube: end to end along its axis
  axis?: 'x' | 'y' | 'z'; // tube: the axis it runs along (y when left out)
  rot?: Vec3; // the turn about x, y and z, in radians, before the shape is put at `at`
  mirror?: boolean; // also draw the shape mirrored in x (a leg, a shoulder)
}

// The droid's size and the look of its plates. The body is 1.56 m tall from the soles to the top of the head, as the
// humans it replaces were: the pose's body and head heights (SOLDIER_POSE) still hold.
export const DROID_TUNE = {
  height: 1.56, // metres from the soles to the top of the head
  bevel: 0.007, // a plate's chamfer when it names none (m)
  bevelSegments: 1, // layers in a chamfer
  roundSegments: 8, // a tube's sides
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

// The shapes of the body and the head. The body's parts stand around its own middle (SOLDIER_POSE.bodyY); the head's
// around its middle (SOLDIER_POSE.headY). The body carries the neck and the rifle; the head is one box with a lit visor.
export const DROID_PARTS: { body: readonly DroidShape[]; head: readonly DroidShape[] } = {
  body: [
    // the pelvis: a dark block with a light band across its front, under a narrow dark waist
    { kind: 'box', material: 'frame', size: [0.22, 0.12, 0.16], at: [0, 0.075, 0.005] },
    { kind: 'box', material: 'accent', size: [0.13, 0.02, 0.012], at: [0, 0.1, -0.082] },
    { kind: 'box', material: 'frame', size: [0.15, 0.13, 0.12], at: [0, 0.2, 0] },
    // the chest: one broad plate that narrows and drops toward the front, over a dark back, leaning into the run
    {
      kind: 'plate',
      material: 'armor',
      size: [0.32, 0.28, 0.22],
      at: [0, 0.37, -0.05],
      bevel: 0.01,
      rot: [-0.2, 0, 0],
      taper: { top: 1.12, front: 0.82, nose: 0.86, drop: 0.04 },
    },
    { kind: 'box', material: 'frame', size: [0.2, 0.24, 0.1], at: [0, 0.35, 0.1] },
    // the lit window in the chest and the orange band under it
    { kind: 'box', material: 'glow', size: [0.1, 0.03, 0.012], at: [0, 0.45, -0.18] },
    { kind: 'box', material: 'accent', size: [0.12, 0.02, 0.012], at: [0, 0.37, -0.163] },
    // the collar on the chest's top and the short dark neck that reaches up into the head's base
    { kind: 'box', material: 'armor', size: [0.15, 0.04, 0.12], at: [0, 0.52, -0.07] },
    { kind: 'box', material: 'frame', size: [0.1, 0.16, 0.1], at: [0, 0.55, -0.07], rot: [0.3, 0, 0] },
    // the shoulder bar and the big cut pauldrons over it
    { kind: 'box', material: 'frame', size: [0.36, 0.05, 0.08], at: [0, 0.47, -0.075] },
    {
      kind: 'plate',
      material: 'armor',
      size: [0.17, 0.13, 0.19],
      at: [0.25, 0.49, -0.065],
      rot: [-0.1, 0, -0.14],
      taper: { top: 0.82, front: 0.72, nose: 0.55, cut: 0.32, cutSide: 'right' },
      mirror: true,
    },
    // the stripe on the left pauldron, the unit's marking
    { kind: 'box', material: 'accent', size: [0.06, 0.025, 0.012], at: [-0.27, 0.515, -0.165] },
    // the thighs: long armour plates over thin frames, with a drum at each knee
    {
      kind: 'plate',
      material: 'armor',
      size: [0.135, THIGH_R.length, 0.15],
      at: THIGH_R.at,
      rot: THIGH_R.rot,
      taper: THIGH_TAPER,
    },
    {
      kind: 'plate',
      material: 'armor',
      size: [0.135, THIGH_L.length, 0.15],
      at: THIGH_L.at,
      rot: THIGH_L.rot,
      taper: THIGH_TAPER_L,
    },
    {
      kind: 'tube',
      material: 'frame',
      axis: 'x',
      radius: 0.05,
      length: 0.12,
      at: DROID_JOINTS.right.knee,
    },
    {
      kind: 'tube',
      material: 'frame',
      axis: 'x',
      radius: 0.05,
      length: 0.12,
      at: DROID_JOINTS.left.knee,
    },
    // the shins and the low feet
    { kind: 'box', material: 'frame', size: [0.085, SHIN_R.length, 0.09], at: SHIN_R.at, rot: SHIN_R.rot },
    { kind: 'box', material: 'frame', size: [0.085, SHIN_L.length, 0.09], at: SHIN_L.at, rot: SHIN_L.rot },
    { kind: 'box', material: 'frame', size: [0.13, 0.05, 0.26], at: DROID_JOINTS.right.foot },
    { kind: 'box', material: 'frame', size: [0.13, 0.05, 0.26], at: DROID_JOINTS.left.foot },
    // the arms: thin upper arms from the shoulders, dark elbows and light forearms coming in to the rifle
    { kind: 'box', material: 'frame', size: [0.055, UPPER_R.length, 0.06], at: UPPER_R.at, rot: UPPER_R.rot },
    { kind: 'box', material: 'frame', size: [0.055, UPPER_L.length, 0.06], at: UPPER_L.at, rot: UPPER_L.rot },
    { kind: 'box', material: 'frame', size: [0.065, 0.06, 0.065], at: DROID_JOINTS.right.elbow },
    { kind: 'box', material: 'frame', size: [0.065, 0.06, 0.065], at: DROID_JOINTS.left.elbow },
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
    // the rifle: a light receiver and stock, a dark barrel and magazine, an orange band and a lit line, held across the
    // chest
    { kind: 'box', material: 'armor', size: [0.24, 0.065, 0.06], at: [0.02, 0.29, -0.21] },
    { kind: 'box', material: 'frame', size: [0.3, 0.032, 0.036], at: [-0.23, 0.295, -0.21] },
    { kind: 'box', material: 'armor', size: [0.11, 0.055, 0.05], at: [0.18, 0.28, -0.205] },
    { kind: 'box', material: 'frame', size: [0.04, 0.11, 0.05], at: [-0.01, 0.225, -0.21] },
    { kind: 'box', material: 'accent', size: [0.035, 0.08, 0.022], at: [-0.14, 0.29, -0.225] },
    { kind: 'box', material: 'glow', size: [0.15, 0.014, 0.012], at: [0, 0.255, -0.245] },
  ],
  head: [
    // the head: a chamfered sensor box, a dark visor frame and a wide lit window
    {
      kind: 'plate',
      material: 'armor',
      size: [0.28, 0.3, 0.26],
      at: [0, 0, 0],
      bevel: 0.01,
      taper: { top: 0.84, front: 0.78, nose: 0.72, drop: 0.03 },
    },
    { kind: 'box', material: 'frame', size: [0.24, 0.075, 0.02], at: [0, -0.005, -0.138] },
    { kind: 'box', material: 'glow', size: [0.2, 0.038, 0.018], at: [0, -0.005, -0.15] },
    // a low sensor ridge on top: its top is the 1.56 m the humans stood
    { kind: 'box', material: 'frame', size: [0.16, 0.05, 0.12], at: [0, 0.175, 0.02] },
  ],
};
