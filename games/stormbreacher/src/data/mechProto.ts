// The kit of a mech (SB-2080): one skeleton for every machine, and the parts that change its look. The skeleton is the
// legs, the hip, the torso's shell and the arms; the parts are the head, the torso's ornament, the two shoulders, the back
// and the weapon in the hand. A kit names one part for each slot and one palette, so a mech is "skeleton + parts +
// colours" (PROTO_KITS). The shapes began with the prototype of SB-1468; SB-2081 makes the player's kit (player) the
// three views' white machine, and SB-2082 makes the sniper and the scout from the same head, shoulders and backs, with
// the allies' band on their own kits. SB-2083 gives the three enemy roles their kits, and SB-2084 gives the boss its
// own parts, a larger scale and the three views' claw. The tables are read by
// view/mechProtoModel.ts, and its bones are the skeleton's:
//   - the legs fold at the knee and the ankle (the foot keeps the ground),
//   - the torso leans, the head stays level,
//   - an arm swings from the shoulder and bends at the elbow,
//   - a shoulder's armour turns with the arm; a pod that sits over it is bound to the torso.
// Ratios of the mech's height: the feet at y = 0, the front toward -z and the right toward +x; the legs are measured from
// the ground and the rest from the hip top. Every value here is provisional.
import type { Vec3 } from './mech.ts';

// The materials of a mech. The colours come from a palette (data/colors.ts's PROTO_PALETTES); `armor` is the plates,
// `frame` the joints and the dark metal, `accent` the type's marks and `glow` the lamps and the sensor. `mark` is the
// friendly side's own band and number (#551), kept clear of the type's colours; a kit without those shapes never draws
// it. A palette is the numbers a kit wears, so the faction and the type choose them without touching a shape.
export type ProtoMaterial = 'armor' | 'frame' | 'accent' | 'glow' | 'mark';

export interface ProtoMaterialDef {
  metalness: number;
  roughness: number;
  emissive: number; // the light it gives; 0 is a plain metal
  envMapIntensity: number; // how much of the surroundings' light it catches
}

export const PROTO_MATERIALS: Record<ProtoMaterial, ProtoMaterialDef> = {
  armor: { metalness: 0.2, roughness: 0.62, emissive: 0, envMapIntensity: 0.95 },
  frame: { metalness: 0.8, roughness: 0.35, emissive: 0, envMapIntensity: 1.05 },
  accent: { metalness: 0.15, roughness: 0.6, emissive: 0, envMapIntensity: 0.6 },
  glow: { metalness: 0.0, roughness: 0.4, emissive: 1.1, envMapIntensity: 0.1 },
  // the friendly side's painted band and number: flat paint, like the accent, without the accent's hazard stripes
  mark: { metalness: 0.1, roughness: 0.65, emissive: 0, envMapIntensity: 0.5 },
};

// How a plate is bent away from its box (view/mechShapes.ts's plateGeometry): its width top and bottom and front and
// back, a wedge's shorter front, a front edge that drops, and a cut on one side. A multiplier of 1 keeps the box.
export interface ProtoPlateTaper {
  top?: number; // width at the top, against the bottom
  bottom?: number; // width at the bottom
  front?: number; // width at the front (-z), against the back
  back?: number; // width at the back
  nose?: number; // height at the front, against the back
  drop?: number; // how far the front edge sits lower, as a share of the plate's height
  cut?: number; // how far one side is cut in at the top, as a share of the plate's width
  cutSide?: 'left' | 'right'; // the side the cut is on (right when left out)
}

// The shapes a part is made of. A plate is a chamfered, bent box; a tube, a ring, a piston and a ring of bolts are round.
// `size` is a plate's [width, height, depth], `radius` a round shape's, `length` a tube's or a piston's along its axis,
// `tube` a ring's thickness and `bolt` a bolt's radius. Only the fields a shape's kind uses are written.
export type ProtoShapeKind = 'plate' | 'tube' | 'ring' | 'piston' | 'bolts';

export interface ProtoShape {
  kind: ProtoShapeKind;
  material: ProtoMaterial;
  at: Vec3; // the shape's centre, as a ratio of the mech's height
  size?: Vec3; // plate
  bevel?: number; // plate: the chamfer's width (PROTO_TUNE.bevel when left out)
  taper?: ProtoPlateTaper; // plate: the bend from the plain box
  radius?: number; // tube, piston, bolts: the radius; ring: the ring's circle
  length?: number; // tube, piston: from end to end
  tube?: number; // ring: the thickness of the ring itself
  count?: number; // bolts: how many around the circle
  bolt?: number; // bolts: a bolt head's radius
  extend?: number; // piston: how far the rod is out (1 is its full length, 0.7 pushes it in a little)
  axis?: 'x' | 'y' | 'z'; // round shapes: the axis they run along (y when left out)
  rot?: Vec3; // the turn about x, y and z, in radians, before the shape is put at `at`
  mirror?: boolean; // also draw the shape mirrored in x (a leg, a shoulder)
}

// A shape set that hangs from a mount (a weapon, a pod): its `at` is measured from the mount, like WEAPON_LOOK.
export interface ProtoWeapon {
  shapes: readonly ProtoShape[];
  mount?: Vec3;
}

// How much of a mech's parts are drawn: `full` is every shape, and `far` leaves out the small shapes a machine only reads
// close up (SB-2083, for the enemies, which stand in crowds at a distance).
export type ProtoDetail = 'full' | 'far';

// Where the rig bends. The heights are ratios from the ground; the arm and head pivots are ratios from the hip top.
// A leg shape belongs to the bone above its own height (the thigh above the knee, the shin above the ankle, the foot
// below it); an arm shape above the elbow swings from the shoulder, the rest from the elbow.
export interface ProtoJoints {
  hipX: number; // the hip joint's offset from the middle, each side
  knee: number;
  ankle: number;
  shoulder: Vec3; // the right shoulder's pivot, from the hip top
  elbow: Vec3; // the elbow, from the shoulder
  neck: Vec3; // the head's pivot, from the hip top
}

// A shape turned over the x = 0 plane: its place at -x, the turns about y and z flipped, and a one-sided cut moved to
// the other side, so a pauldron stays symmetrical. The view uses it too, for the left of a mirrored pair.
export function mirrorShape(shape: ProtoShape): ProtoShape {
  const mirrored: ProtoShape = { ...shape, at: [-shape.at[0], shape.at[1], shape.at[2]] };
  if (shape.rot !== undefined) mirrored.rot = [shape.rot[0], -shape.rot[1], -shape.rot[2]];
  if (shape.taper?.cutSide !== undefined) {
    mirrored.taper = { ...shape.taper, cutSide: shape.taper.cutSide === 'left' ? 'right' : 'left' };
  }
  return mirrored;
}

export function mirrorShapes(shapes: readonly ProtoShape[]): ProtoShape[] {
  return shapes.map(mirrorShape);
}

// The skeleton every kit shares: the legs, the hip and the torso's shell, the arms below the shoulder's pauldron, and
// the free hand. The body's shell is the waist, the abdomen, the chest and the collar; its ornament (the cockpit, the
// vents and the markings) is a part (PROTO_TORSOS), so a kit can leave the chest plain or dress it.
export interface ProtoSkeleton {
  hipY: number; // the hip top's height, as a ratio of the mech's height
  gait: 'biped';
  joints: ProtoJoints;
  legs: readonly ProtoShape[];
  core: readonly ProtoShape[]; // the body's shell
  arms: readonly ProtoShape[]; // the upper arm, the elbow and the forearm, mirrored in x
  handL: readonly ProtoShape[]; // the free hand: an open palm, so it does not read as a magazine
}

// The parts a kit chooses. Each slot is a named table: the head, the torso's ornament, the two shoulders, the back and
// the weapon in the right hand.
export interface ProtoHeadPart {
  shapes: readonly ProtoShape[];
}

export interface ProtoTorsoPart {
  shapes: readonly ProtoShape[]; // ornament only; the shell is in the skeleton
}

export interface ProtoShoulderPart {
  shapes: readonly ProtoShape[]; // the pauldron, in the right shoulder's place; the left slot mirrors it in x
  onLeft?: ProtoWeapon; // a pod over the left shoulder, bound to the torso (the player's missile pod)
  onRight?: ProtoWeapon; // a pod over the right shoulder, bound to the torso
}

export interface ProtoBackPart {
  shapes: readonly ProtoShape[];
  exhaust: readonly Vec3[]; // where the boost's flame leaves, facing back (ratio, from the hip top)
}

export interface ProtoWeaponPart {
  hand: readonly ProtoShape[]; // the fist that grips it (or a claw)
  shapes: readonly ProtoShape[]; // the weapon itself, relative to the mount
  mount: Vec3; // where it hangs, from the hip top
  muzzle?: Vec3; // the barrel's mouth, in the same place as the shapes (the flash and the tracer leave here)
}

// A free hand a kit can swap for the skeleton's open palm (SB-2084: the boss's claw). The shapes are in the same place
// as the skeleton's, so the arm that carries them does not move.
export interface ProtoHandPart {
  shapes: readonly ProtoShape[];
}

// How a kit holds its weapon: the free arm's forward turn and each shoulder's inward turn, so a two-handed gun can be
// gripped by both hands. A kit that leaves them out keeps PROTO_TUNE.pose's free arm.
export interface ProtoArmPose {
  offShoulder?: number; // the free arm's forward turn (rad)
  leftIn?: number; // the free shoulder's inward turn about z (rad)
  rightIn?: number; // the weapon shoulder's inward turn about z (rad)
}

// The colours a kit wears, by faction and type (data/colors.ts's PROTO_PALETTES). [armor, frame/joints, accent, glow,
// mark]. `allyWreck` is the allies' pale colours gone dark, for the model lying over once one has fallen.
export const PROTO_PALETTE_IDS = ['player', 'ally', 'sniper', 'scout', 'enemy', 'boss', 'allyWreck'] as const;
export type ProtoPaletteId = (typeof PROTO_PALETTE_IDS)[number];

// The legs: the foot's sole, toe and heel, the ankle's drum, the shin, the knee, the thigh, the hydraulics and the hip
// drum. The same for every kit.
const PLAYER_LEGS: readonly ProtoShape[] = [
  // the foot: a long low sole, a wedge toe, a heel block, and a light line along the instep
  {
    kind: 'plate',
    material: 'frame',
    size: [0.14, 0.035, 0.3],
    at: [0.115, 0.0175, -0.03],
    bevel: 0.01,
    taper: { front: 0.75, nose: 0.7, drop: 0.12 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.13, 0.05, 0.11],
    at: [0.115, 0.045, -0.2],
    bevel: 0.008,
    taper: { front: 0.55, nose: 0.5, drop: 0.16 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.09, 0.065, 0.07],
    at: [0.115, 0.042, 0.125],
    bevel: 0.008,
    taper: { top: 0.8, nose: 0.85 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'glow',
    size: [0.006, 0.006, 0.16],
    at: [0.115, 0.055, -0.09],
    bevel: 0.001,
    mirror: true,
  },
  // the ankle: a thin drum and its ring of bolts
  { kind: 'tube', material: 'frame', axis: 'x', radius: 0.04, length: 0.13, at: [0.115, 0.09, 0], mirror: true },
  {
    kind: 'bolts',
    material: 'frame',
    axis: 'x',
    radius: 0.048,
    count: 6,
    bolt: 0.006,
    at: [0.181, 0.09, 0],
    mirror: true,
  },
  // the shin: a shell that widens toward the knee, a front blade, a calf, a light line, a piston and a cable
  {
    kind: 'plate',
    material: 'armor',
    size: [0.12, 0.21, 0.15],
    at: [0.115, 0.225, 0.005],
    bevel: 0.012,
    taper: { top: 1.15, front: 0.85, nose: 0.82, drop: 0.1 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.085, 0.17, 0.035],
    at: [0.115, 0.235, -0.085],
    bevel: 0.007,
    taper: { top: 1.2, front: 0.7, nose: 0.7, drop: 0.15 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.07, 0.13, 0.06],
    at: [0.115, 0.2, 0.085],
    bevel: 0.008,
    taper: { top: 1.1, front: 0.8, nose: 0.85 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'glow',
    size: [0.006, 0.14, 0.006],
    at: [0.177, 0.225, -0.015],
    bevel: 0.001,
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'glow',
    size: [0.004, 0.12, 0.004],
    at: [0.115, 0.23, -0.106],
    bevel: 0.001,
    mirror: true,
  },
  {
    kind: 'piston',
    material: 'frame',
    axis: 'y',
    radius: 0.011,
    length: 0.16,
    at: [0.152, 0.225, 0.075],
    rot: [0.1, 0, 0],
    mirror: true,
  },
  {
    kind: 'tube',
    material: 'frame',
    axis: 'y',
    radius: 0.005,
    length: 0.26,
    at: [0.163, 0.235, 0.055],
    mirror: true,
  },
  // the knee: a narrow drum, an outer ring, a cut kneecap
  {
    kind: 'tube',
    material: 'frame',
    axis: 'x',
    radius: 0.055,
    length: 0.14,
    at: [0.115, 0.335, -0.005],
    mirror: true,
  },
  {
    kind: 'ring',
    material: 'frame',
    axis: 'x',
    radius: 0.045,
    tube: 0.008,
    at: [0.187, 0.335, -0.005],
    mirror: true,
  },
  {
    kind: 'bolts',
    material: 'frame',
    axis: 'x',
    radius: 0.028,
    count: 6,
    bolt: 0.005,
    at: [0.188, 0.335, -0.005],
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.1, 0.075, 0.06],
    at: [0.115, 0.345, -0.08],
    bevel: 0.008,
    taper: { front: 0.6, nose: 0.55, drop: 0.18 },
    mirror: true,
  },
  // the thigh: a broad shell narrowing to the knee, an outer plate, a guard, a light line, a piston and a cable
  {
    kind: 'plate',
    material: 'armor',
    size: [0.13, 0.17, 0.14],
    at: [0.115, 0.437, 0.005],
    bevel: 0.012,
    taper: { top: 1.2, front: 0.88, nose: 0.85, drop: 0.08 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.03, 0.13, 0.1],
    at: [0.172, 0.44, 0],
    bevel: 0.007,
    taper: { top: 1.15, nose: 0.8 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.035, 0.06, 0.03],
    at: [0.115, 0.44, -0.082],
    bevel: 0.004,
    taper: { front: 0.6, nose: 0.6, drop: 0.14 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'glow',
    size: [0.018, 0.045, 0.004],
    at: [0.115, 0.44, -0.099],
    bevel: 0.001,
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'glow',
    size: [0.004, 0.1, 0.004],
    at: [0.115, 0.44, -0.104],
    bevel: 0.001,
    mirror: true,
  },
  { kind: 'plate', material: 'glow', size: [0.006, 0.1, 0.006], at: [0.19, 0.44, -0.02], bevel: 0.001, mirror: true },
  {
    kind: 'piston',
    material: 'frame',
    axis: 'y',
    radius: 0.01,
    length: 0.13,
    at: [0.152, 0.44, 0.075],
    rot: [-0.12, 0, 0],
    mirror: true,
  },
  { kind: 'tube', material: 'frame', axis: 'y', radius: 0.005, length: 0.18, at: [0.163, 0.44, 0.06], mirror: true },
  // the hip drum
  { kind: 'tube', material: 'frame', axis: 'x', radius: 0.06, length: 0.14, at: [0.115, 0.525, 0.01], mirror: true },
];

// The body's shell: the waist, the abdomen, the chest's broad plates (the side facets included), the back plate and the
// collar. The chest reads as an inverted triangle on the narrow waist; the decorations are the torso part.
const PLAYER_CORE: readonly ProtoShape[] = [
  // the waist: a drum, a bolt ring and a narrow pelvis
  { kind: 'tube', material: 'frame', axis: 'y', radius: 0.05, length: 0.055, at: [0, 0.005, 0] },
  { kind: 'bolts', material: 'frame', axis: 'y', radius: 0.058, count: 8, bolt: 0.005, at: [0, 0.032, 0] },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.17, 0.07, 0.15],
    at: [0, 0.035, 0],
    bevel: 0.01,
    taper: { top: 0.8, front: 0.85, nose: 0.82, drop: 0.09 },
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.11, 0.05, 0.035],
    at: [0, 0.035, -0.078],
    bevel: 0.006,
    taper: { front: 0.7, nose: 0.8, drop: 0.12 },
  },
  // the abdomen, kept narrow so the chest overhangs it
  {
    kind: 'plate',
    material: 'frame',
    size: [0.13, 0.075, 0.13],
    at: [0, 0.105, 0],
    bevel: 0.008,
    taper: { top: 1.15, front: 0.85, nose: 0.9 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.15, 0.055, 0.035],
    at: [0, 0.105, -0.075],
    bevel: 0.006,
    taper: { top: 1.1, front: 0.7, nose: 0.7, drop: 0.1 },
  },
  // the chest: a broad shell with a shoulder deck and a wedge front
  {
    kind: 'plate',
    material: 'armor',
    size: [0.28, 0.15, 0.21],
    at: [0, 0.225, 0],
    bevel: 0.018,
    taper: { top: 1.05, front: 0.85, nose: 0.85, drop: 0.09 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.3, 0.06, 0.18],
    at: [0, 0.305, 0.01],
    bevel: 0.012,
    taper: { top: 0.85, front: 0.9, nose: 0.8 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.22, 0.11, 0.05],
    at: [0, 0.225, -0.112],
    bevel: 0.01,
    taper: { top: 1.15, front: 0.65, nose: 0.6, drop: 0.14 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.16, 0.045, 0.035],
    at: [0, 0.155, -0.108],
    bevel: 0.006,
    taper: { front: 0.7, nose: 0.7, drop: 0.12 },
  },
  // the chest's angled side facets, so the front breaks into planes
  {
    kind: 'plate',
    material: 'armor',
    size: [0.09, 0.11, 0.03],
    at: [0.085, 0.235, -0.126],
    rot: [0, 0, 0.22],
    bevel: 0.006,
    taper: { front: 0.7, nose: 0.7, drop: 0.12 },
    mirror: true,
  },
  // the back plate under the pack, and the collar the head turns in
  {
    kind: 'plate',
    material: 'frame',
    size: [0.22, 0.12, 0.04],
    at: [0, 0.23, 0.112],
    bevel: 0.008,
    taper: { top: 1.1, nose: 0.9 },
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.16, 0.04, 0.13],
    at: [0, 0.35, 0],
    bevel: 0.008,
    taper: { top: 0.9, front: 0.9 },
  },
];

// The arms below the pauldron: a thin frame with a front plate, the elbow, the forearm, and the hydraulics and cable.
const PLAYER_ARMS: readonly ProtoShape[] = [
  // the upper arm: a thin frame with a front plate and a light line
  {
    kind: 'plate',
    material: 'frame',
    size: [0.07, 0.12, 0.09],
    at: [0.235, 0.255, 0],
    bevel: 0.007,
    taper: { top: 1.1, front: 0.9, nose: 0.9 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.09, 0.09, 0.035],
    at: [0.235, 0.26, -0.06],
    bevel: 0.006,
    taper: { front: 0.7, nose: 0.75, drop: 0.1 },
    mirror: true,
  },
  { kind: 'plate', material: 'glow', size: [0.005, 0.06, 0.005], at: [0.273, 0.26, 0], bevel: 0.001, mirror: true },
  // the elbow
  { kind: 'tube', material: 'frame', axis: 'x', radius: 0.045, length: 0.11, at: [0.235, 0.19, 0], mirror: true },
  { kind: 'ring', material: 'frame', axis: 'x', radius: 0.035, tube: 0.007, at: [0.29, 0.19, 0], mirror: true },
  // the forearm and its outer plate with a light line (the hands are their own parts below)
  {
    kind: 'plate',
    material: 'armor',
    size: [0.09, 0.13, 0.1],
    at: [0.235, 0.105, -0.005],
    bevel: 0.009,
    taper: { top: 1.1, front: 0.85, nose: 0.8, drop: 0.08 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.03, 0.1, 0.08],
    at: [0.278, 0.11, -0.005],
    bevel: 0.006,
    taper: { top: 1.1, nose: 0.8 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'glow',
    size: [0.005, 0.07, 0.005],
    at: [0.281, 0.105, -0.02],
    bevel: 0.001,
    mirror: true,
  },
  // the hydraulics and the cable down the arm
  {
    kind: 'piston',
    material: 'frame',
    axis: 'y',
    radius: 0.01,
    length: 0.12,
    at: [0.274, 0.25, -0.045],
    rot: [0.1, 0, 0],
    mirror: true,
  },
  { kind: 'tube', material: 'frame', axis: 'y', radius: 0.005, length: 0.13, at: [0.215, 0.24, 0.05], mirror: true },
];

// The free hand: an open palm with three fingers, so the left arm does not end in something gun-shaped.
const PLAYER_HAND_L: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'frame',
    size: [0.06, 0.05, 0.07],
    at: [-0.235, 0.025, -0.01],
    bevel: 0.006,
    taper: { front: 0.85, nose: 0.85 },
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.012, 0.045, 0.016],
    at: [-0.257, 0.0, -0.03],
    rot: [0.35, 0, 0],
    bevel: 0.002,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.012, 0.045, 0.016],
    at: [-0.235, -0.002, -0.038],
    rot: [0.35, 0, 0],
    bevel: 0.002,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.012, 0.045, 0.016],
    at: [-0.213, -0.002, -0.03],
    rot: [0.35, 0, 0],
    bevel: 0.002,
  },
];

// The older head: the neck, the wedged head, a dark visor frame under a brow, lamps and a short antenna.
const PLAYER_HEAD: readonly ProtoShape[] = [
  { kind: 'tube', material: 'frame', axis: 'y', radius: 0.04, length: 0.06, at: [0, 0.36, -0.005] },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.12, 0.085, 0.12],
    at: [0, 0.402, -0.005],
    bevel: 0.008,
    taper: { top: 0.8, front: 0.75, nose: 0.7, drop: 0.08 },
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.13, 0.022, 0.05],
    at: [0, 0.438, -0.06],
    bevel: 0.005,
    taper: { front: 0.6, nose: 0.5, drop: 0.1 },
  },
  { kind: 'plate', material: 'frame', size: [0.115, 0.04, 0.018], at: [0, 0.403, -0.068], bevel: 0.003 },
  { kind: 'plate', material: 'glow', size: [0.1, 0.03, 0.014], at: [0, 0.403, -0.08], bevel: 0.002 },
  {
    kind: 'plate',
    material: 'glow',
    size: [0.014, 0.014, 0.012],
    at: [0.058, 0.393, -0.066],
    bevel: 0.002,
    mirror: true,
  },
  { kind: 'plate', material: 'frame', size: [0.01, 0.04, 0.01], at: [0.058, 0.428, 0.015], bevel: 0.001 },
  { kind: 'plate', material: 'accent', size: [0.055, 0.014, 0.02], at: [0, 0.368, -0.055], bevel: 0.003 },
];

// The fist every weapon's hand starts from (the shape of SB-1468's main arm).
const PLAYER_WEAPON_HAND: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'frame',
    size: [0.075, 0.06, 0.08],
    at: [0.235, 0.025, -0.015],
    bevel: 0.007,
    taper: { front: 0.8, nose: 0.8 },
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.018, 0.04, 0.022],
    at: [0.203, 0.03, -0.03],
    rot: [0.3, 0, 0.25],
    bevel: 0.002,
  },
];

// The older pauldron (the sniper's bare shoulder): a drum and ring under a big plate cut on its outer top and tipped
// outward, with a dark lower rim, an orange band and a light line. The left slot mirrors it, so the two stay symmetrical.
const PLAYER_SHOULDER: readonly ProtoShape[] = [
  { kind: 'tube', material: 'frame', axis: 'x', radius: 0.055, length: 0.13, at: [0.215, 0.3, 0.015] },
  { kind: 'ring', material: 'frame', axis: 'x', radius: 0.045, tube: 0.008, at: [0.285, 0.3, 0.015] },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.15, 0.04, 0.17],
    at: [0.265, 0.288, 0],
    rot: [0, 0, -0.1],
    bevel: 0.006,
    taper: { top: 1.0, front: 0.8, nose: 0.7 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.17, 0.13, 0.2],
    at: [0.265, 0.345, 0],
    rot: [0, 0, -0.1],
    bevel: 0.014,
    taper: { top: 0.85, front: 0.75, nose: 0.6, drop: 0.16, cut: 0.38, cutSide: 'right' },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.14, 0.03, 0.16],
    at: [0.265, 0.415, 0],
    rot: [0, 0, -0.1],
    bevel: 0.006,
    taper: { top: 0.65, front: 0.6, nose: 0.5 },
  },
  {
    kind: 'plate',
    material: 'accent',
    size: [0.02, 0.07, 0.1],
    at: [0.338, 0.34, 0],
    rot: [0, 0, -0.1],
    bevel: 0.005,
  },
  {
    kind: 'plate',
    material: 'glow',
    size: [0.005, 0.05, 0.006],
    at: [0.339, 0.34, -0.055],
    rot: [0, 0, -0.1],
    bevel: 0.001,
  },
];

// The missile pod over the left shoulder: a cut housing under an armour shroud, three forward missile tubes, slits and
// a light line. It hangs from the back mount and is bound to the torso.
const PLAYER_POD: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'armor',
    size: [0.12, 0.1, 0.13],
    at: [0, 0.01, 0.04],
    bevel: 0.01,
    taper: { top: 0.9, front: 0.7, nose: 0.8, cut: 0.18, cutSide: 'left' },
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.11, 0.04, 0.14],
    at: [0, 0.01, 0.04],
    bevel: 0.006,
    taper: { top: 0.9, front: 0.7, nose: 0.9 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.13, 0.03, 0.11],
    at: [0, 0.07, 0.02],
    bevel: 0.005,
    taper: { top: 0.7, front: 0.7, nose: 0.6 },
  },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.02, length: 0.09, at: [-0.034, 0.035, -0.075] },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.02, length: 0.09, at: [0.034, 0.035, -0.075] },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.02, length: 0.09, at: [0, -0.03, -0.075] },
  { kind: 'ring', material: 'frame', axis: 'z', radius: 0.024, tube: 0.004, at: [-0.034, 0.035, -0.12] },
  { kind: 'ring', material: 'frame', axis: 'z', radius: 0.024, tube: 0.004, at: [0.034, 0.035, -0.12] },
  { kind: 'ring', material: 'frame', axis: 'z', radius: 0.024, tube: 0.004, at: [0, -0.03, -0.12] },
  { kind: 'plate', material: 'accent', size: [0.08, 0.01, 0.006], at: [0, 0.055, 0.055], bevel: 0.002 },
  { kind: 'plate', material: 'glow', size: [0.004, 0.004, 0.08], at: [0, 0.06, 0.03], bevel: 0.001 },
  { kind: 'ring', material: 'frame', axis: 'x', radius: 0.03, tube: 0.007, at: [-0.02, 0, -0.05] },
];

// The mounts of the player's kit: the autocannon hangs from the right hand's elbow, the pod from the left shoulder.
const PLAYER_ARM_MOUNT: Vec3 = [0.235, 0.09, -0.1];
const PLAYER_BACK_MOUNT: Vec3 = [-0.35, 0.36, 0.04];

// The three-view player (SB-2081): white armour, black joints, yellow bands and a teal visor. The head is a small helmet
// with a wide sensor; the chest carries the instrument box; the shoulders are boxy pods with two ports on the back; the
// backpack has a grille and the ammo feed; and the twin autocannon is held at the waist by both hands. The parts are in
// absolute places from the hip top, as the skeleton's are, so the hold reads from the front and the side alike.
const ORTHO_HEAD: readonly ProtoShape[] = [
  { kind: 'tube', material: 'frame', axis: 'y', radius: 0.038, length: 0.05, at: [0, 0.36, -0.005] },
  // the helmet and its top cap
  {
    kind: 'plate',
    material: 'armor',
    size: [0.115, 0.09, 0.105],
    at: [0, 0.405, -0.005],
    bevel: 0.008,
    taper: { top: 0.82, front: 0.82, nose: 0.75, drop: 0.06 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.13, 0.035, 0.115],
    at: [0, 0.45, 0],
    bevel: 0.006,
    taper: { top: 0.8, front: 0.85 },
  },
  // the dark visor frame and the teal sensor
  {
    kind: 'plate',
    material: 'frame',
    size: [0.12, 0.052, 0.024],
    at: [0, 0.405, -0.06],
    bevel: 0.004,
    taper: { front: 0.9, nose: 0.85 },
  },
  { kind: 'plate', material: 'glow', size: [0.1, 0.032, 0.014], at: [0, 0.405, -0.073], bevel: 0.002 },
  // the brow and the chin
  {
    kind: 'plate',
    material: 'armor',
    size: [0.125, 0.02, 0.04],
    at: [0, 0.438, -0.06],
    bevel: 0.003,
    taper: { front: 0.7, nose: 0.6 },
  },
  { kind: 'plate', material: 'frame', size: [0.08, 0.022, 0.03], at: [0, 0.373, -0.05], bevel: 0.002 },
  // the yellow band on each side of the helmet, and the vents behind it
  {
    kind: 'plate',
    material: 'accent',
    size: [0.008, 0.045, 0.06],
    at: [0.059, 0.408, 0.005],
    bevel: 0.001,
    mirror: true,
  },
  { kind: 'plate', material: 'frame', size: [0.055, 0.028, 0.016], at: [0, 0.425, 0.052], bevel: 0.002 },
  { kind: 'plate', material: 'frame', size: [0.04, 0.02, 0.012], at: [0, 0.39, 0.055], bevel: 0.002 },
];

// The chest's instrument box: a dark housing with a teal screen, a yellow and a teal lamp under it, the side vents and
// a small yellow mark. The body's shell stays the skeleton's.
const ORTHO_TORSO: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'frame',
    size: [0.135, 0.115, 0.028],
    at: [0, 0.235, -0.135],
    bevel: 0.005,
    taper: { front: 0.9, nose: 0.9 },
  },
  { kind: 'plate', material: 'frame', size: [0.11, 0.085, 0.014], at: [0, 0.235, -0.152], bevel: 0.002 },
  { kind: 'plate', material: 'glow', size: [0.082, 0.04, 0.012], at: [0, 0.258, -0.162], bevel: 0.002 },
  { kind: 'plate', material: 'accent', size: [0.014, 0.014, 0.01], at: [-0.03, 0.222, -0.162], bevel: 0.001 },
  { kind: 'plate', material: 'accent', size: [0.014, 0.014, 0.01], at: [0, 0.222, -0.162], bevel: 0.001 },
  { kind: 'plate', material: 'glow', size: [0.014, 0.014, 0.01], at: [0.03, 0.222, -0.162], bevel: 0.001 },
  { kind: 'plate', material: 'frame', size: [0.02, 0.09, 0.12], at: [0.146, 0.22, 0], bevel: 0.005, mirror: true },
  { kind: 'plate', material: 'accent', size: [0.022, 0.07, 0.1], at: [0.153, 0.22, 0], bevel: 0.005, mirror: true },
  {
    kind: 'plate',
    material: 'accent',
    size: [0.045, 0.02, 0.008],
    at: [0.08, 0.285, -0.142],
    rot: [0, 0, -0.35],
    bevel: 0.002,
  },
  { kind: 'plate', material: 'glow', size: [0.08, 0.005, 0.005], at: [0, 0.15, -0.145], bevel: 0.001 },
];

// The player's shoulder: a boxy white pod with a dark front face, a yellow band on its outer top, and two dark ports on
// its back. The left slot mirrors it.
const ORTHO_SHOULDER: readonly ProtoShape[] = [
  { kind: 'tube', material: 'frame', axis: 'x', radius: 0.055, length: 0.13, at: [0.215, 0.3, 0.015] },
  { kind: 'ring', material: 'frame', axis: 'x', radius: 0.045, tube: 0.008, at: [0.285, 0.3, 0.015] },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.19, 0.16, 0.21],
    at: [0.28, 0.36, 0],
    bevel: 0.014,
    taper: { top: 0.9, front: 0.85, nose: 0.8, drop: 0.06 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.17, 0.04, 0.19],
    at: [0.28, 0.45, 0],
    bevel: 0.006,
    taper: { top: 0.85, front: 0.8, nose: 0.75 },
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.15, 0.035, 0.17],
    at: [0.28, 0.285, 0],
    bevel: 0.005,
    taper: { top: 0.9, front: 0.8, nose: 0.8 },
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.1, 0.115, 0.03],
    at: [0.26, 0.35, -0.105],
    bevel: 0.004,
    taper: { front: 0.9, nose: 0.9 },
  },
  { kind: 'plate', material: 'frame', size: [0.12, 0.15, 0.025], at: [0.28, 0.36, 0.105], bevel: 0.004 },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.026, length: 0.03, at: [0.28, 0.405, 0.125] },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.026, length: 0.03, at: [0.28, 0.315, 0.125] },
  { kind: 'ring', material: 'armor', axis: 'z', radius: 0.032, tube: 0.006, at: [0.28, 0.405, 0.14] },
  { kind: 'ring', material: 'armor', axis: 'z', radius: 0.032, tube: 0.006, at: [0.28, 0.315, 0.14] },
  { kind: 'plate', material: 'accent', size: [0.012, 0.06, 0.1], at: [0.378, 0.405, 0], bevel: 0.002 },
  { kind: 'plate', material: 'accent', size: [0.04, 0.014, 0.11], at: [0.35, 0.465, 0], bevel: 0.002 },
  { kind: 'plate', material: 'glow', size: [0.005, 0.04, 0.006], at: [0.38, 0.35, -0.05], bevel: 0.001 },
];

// The player's back: a white pack with a dark grille, the ammo feed's port on its left, and two exhausts below.
const ORTHO_BACK: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'armor',
    size: [0.27, 0.23, 0.13],
    at: [0, 0.24, 0.16],
    bevel: 0.012,
    taper: { top: 0.95, front: 0.9, nose: 0.85, drop: 0.06 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.2, 0.07, 0.11],
    at: [0, 0.365, 0.17],
    bevel: 0.006,
    taper: { top: 0.8, front: 0.85, nose: 0.8 },
  },
  { kind: 'plate', material: 'frame', size: [0.075, 0.16, 0.025], at: [0, 0.24, 0.228], bevel: 0.004 },
  { kind: 'plate', material: 'armor', size: [0.055, 0.012, 0.012], at: [0, 0.19, 0.242], bevel: 0.001 },
  { kind: 'plate', material: 'armor', size: [0.055, 0.012, 0.012], at: [0, 0.24, 0.242], bevel: 0.001 },
  { kind: 'plate', material: 'armor', size: [0.055, 0.012, 0.012], at: [0, 0.29, 0.242], bevel: 0.001 },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.055, 0.12, 0.1],
    at: [0.14, 0.26, 0.17],
    bevel: 0.005,
    mirror: true,
  },
  {
    kind: 'tube',
    material: 'frame',
    axis: 'z',
    radius: 0.028,
    length: 0.05,
    at: [-0.1, 0.27, 0.2],
    rot: [0.4, 0, -0.4],
  },
  {
    kind: 'ring',
    material: 'accent',
    axis: 'z',
    radius: 0.032,
    tube: 0.005,
    at: [-0.1, 0.27, 0.225],
    rot: [0.4, 0, -0.4],
  },
  { kind: 'plate', material: 'glow', size: [0.005, 0.08, 0.005], at: [0.09, 0.25, 0.232], bevel: 0.001, mirror: true },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.03, length: 0.06, at: [-0.12, 0.12, 0.25] },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.03, length: 0.06, at: [0.12, 0.12, 0.25] },
];

// A ribbed ammo hose between two places from the hip top, bowed toward `bend`: short tubes along a quadratic curve with a
// ring at every joint, so it reads as the feed of a belt rather than a rod.
function hose(from: Vec3, bend: Vec3, to: Vec3, segments: number, radius: number): ProtoShape[] {
  const point = (t: number): Vec3 => {
    const u = 1 - t;
    return [
      u * u * from[0] + 2 * u * t * bend[0] + t * t * to[0],
      u * u * from[1] + 2 * u * t * bend[1] + t * t * to[1],
      u * u * from[2] + 2 * u * t * bend[2] + t * t * to[2],
    ];
  };
  const shapes: ProtoShape[] = [];
  let prev = point(0);
  for (let i = 0; i < segments; i++) {
    const next = point((i + 1) / segments);
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const dz = next[2] - prev[2];
    const length = Math.hypot(dx, dy, dz);
    const dir: Vec3 = [dx / length, dy / length, dz / length];
    const rot: Vec3 = [Math.atan2(dir[2], dir[1]), 0, Math.asin(-dir[0])];
    const at: Vec3 = [(prev[0] + next[0]) / 2, (prev[1] + next[1]) / 2, (prev[2] + next[2]) / 2];
    shapes.push({ kind: 'tube', material: 'frame', axis: 'y', radius, length, at, rot });
    shapes.push({
      kind: 'ring',
      material: 'frame',
      axis: 'y',
      radius: radius * 1.5,
      tube: radius * 0.4,
      at: next,
      rot,
    });
    prev = next;
  }
  return shapes;
}

// The ammo feed from the gun's right rear, out behind the waist and up over the back to the pack's left port.
const ORTHO_FEED: readonly ProtoShape[] = hose([0.22, 0.04, 0.05], [-0.02, 0.02, 0.24], [-0.1, 0.28, 0.2], 10, 0.026);

// The player's weapon: the twin autocannon held at the waist by both hands. The receiver runs from the right hand to the
// left hand's grip, the two barrels leave its right side, the magazine hangs below, and the feed goes up to the back.
const ORTHO_WEAPON: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'frame',
    size: [0.32, 0.13, 0.17],
    at: [0.09, 0.065, -0.03],
    rot: [0, 0.1, -0.27],
    bevel: 0.01,
    taper: { top: 0.9, front: 0.85, nose: 0.85 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.22, 0.055, 0.12],
    at: [0.09, 0.135, -0.03],
    rot: [0, 0.1, -0.27],
    bevel: 0.006,
    taper: { top: 0.8, front: 0.75, nose: 0.7 },
  },
  {
    kind: 'plate',
    material: 'accent',
    size: [0.018, 0.012, 0.1],
    at: [-0.015, 0.14, -0.02],
    rot: [0, 0.1, -0.27],
    bevel: 0.002,
  },
  {
    kind: 'plate',
    material: 'accent',
    size: [0.018, 0.012, 0.1],
    at: [0.19, 0.14, -0.03],
    rot: [0, 0.1, -0.27],
    bevel: 0.002,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.045, 0.05, 0.09],
    at: [-0.04, 0.065, -0.03],
    rot: [0, 0.1, -0.27],
    bevel: 0.004,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.09, 0.1, 0.12],
    at: [0.1, -0.04, -0.02],
    rot: [0, 0.1, -0.27],
    bevel: 0.005,
    taper: { top: 1.1, front: 0.85, nose: 0.85 },
  },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.055, length: 0.14, at: [0.16, 0.035, -0.14] },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.016, length: 0.52, at: [0.13, 0.035, -0.44] },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.016, length: 0.52, at: [0.19, 0.035, -0.44] },
  { kind: 'ring', material: 'accent', axis: 'z', radius: 0.022, tube: 0.005, at: [0.13, 0.035, -0.21] },
  { kind: 'ring', material: 'accent', axis: 'z', radius: 0.022, tube: 0.005, at: [0.19, 0.035, -0.21] },
  { kind: 'ring', material: 'frame', axis: 'z', radius: 0.021, tube: 0.004, at: [0.13, 0.035, -0.7] },
  { kind: 'ring', material: 'frame', axis: 'z', radius: 0.021, tube: 0.004, at: [0.19, 0.035, -0.7] },
  {
    kind: 'plate',
    material: 'glow',
    size: [0.004, 0.006, 0.12],
    at: [0.09, 0.165, -0.06],
    rot: [0, 0.1, -0.27],
    bevel: 0.001,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.03, 0.04, 0.05],
    at: [0.1, 0.18, -0.02],
    rot: [0, 0.1, -0.27],
    bevel: 0.003,
  },
  ...ORTHO_FEED,
];

// The skeleton every kit uses.
export const PROTO_SKELETON: ProtoSkeleton = {
  hipY: 0.55,
  gait: 'biped',
  joints: {
    hipX: 0.115,
    knee: 0.335,
    ankle: 0.09,
    shoulder: [0.235, 0.3, 0.015],
    elbow: [0, -0.11, -0.015],
    neck: [0, 0.365, -0.005],
  },
  legs: PLAYER_LEGS,
  core: PLAYER_CORE,
  arms: PLAYER_ARMS,
  handL: PLAYER_HAND_L,
};

// The boss (SB-2084): the three views' black machine, a size larger than the line mechs. It keeps the shared skeleton and
// the enemy's three red eyes, and carries the heavy command machine's own parts: the round face guard, the layered chest
// with its big red lamp, the boxy pauldrons, a six-cell missile pod over the right shoulder, a cannon turret over the
// left, the vented back with the ammo belt, an oversized gatling and a claw in place of the free hand.
const BOSS_HEAD: readonly ProtoShape[] = [
  { kind: 'tube', material: 'frame', axis: 'y', radius: 0.042, length: 0.055, at: [0, 0.36, -0.005] },
  // the helmet: wider and rounder than the line machines'
  {
    kind: 'plate',
    material: 'armor',
    size: [0.15, 0.105, 0.145],
    at: [0, 0.406, -0.005],
    bevel: 0.01,
    taper: { top: 0.8, front: 0.8, nose: 0.72, drop: 0.07 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.16, 0.038, 0.13],
    at: [0, 0.462, 0.002],
    bevel: 0.007,
    taper: { top: 0.78, front: 0.85 },
  },
  // the round face guard with the three red eyes inside it
  { kind: 'ring', material: 'frame', axis: 'z', radius: 0.052, tube: 0.014, at: [0, 0.405, -0.078] },
  { kind: 'plate', material: 'glow', size: [0.03, 0.026, 0.016], at: [0, 0.412, -0.085], bevel: 0.002 },
  {
    kind: 'plate',
    material: 'glow',
    size: [0.024, 0.02, 0.016],
    at: [0.03, 0.394, -0.082],
    bevel: 0.002,
    mirror: true,
  },
  // the brow, the side cheeks and the chin
  {
    kind: 'plate',
    material: 'armor',
    size: [0.16, 0.022, 0.045],
    at: [0, 0.451, -0.062],
    bevel: 0.003,
    taper: { front: 0.7, nose: 0.62 },
  },
  { kind: 'plate', material: 'frame', size: [0.1, 0.026, 0.035], at: [0, 0.376, -0.055], bevel: 0.002 },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.04, 0.03, 0.02],
    at: [0.066, 0.405, -0.05],
    bevel: 0.002,
    mirror: true,
  },
  // the red band on each side of the helmet, and the vents behind it
  {
    kind: 'plate',
    material: 'accent',
    size: [0.009, 0.05, 0.07],
    at: [0.078, 0.41, 0.002],
    bevel: 0.001,
    mirror: true,
  },
  { kind: 'plate', material: 'frame', size: [0.06, 0.03, 0.02], at: [0, 0.432, 0.062], bevel: 0.002 },
];

// The boss's chest: a broad slab over the shell, the big red lamp in its dark frame, a vent grille on each side, thicker
// side plates and a collar. The shell below is still the skeleton's.
const BOSS_TORSO: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'armor',
    size: [0.34, 0.19, 0.05],
    at: [0, 0.23, -0.13],
    bevel: 0.01,
    taper: { front: 0.9, nose: 0.9 },
  },
  { kind: 'plate', material: 'frame', size: [0.26, 0.15, 0.025], at: [0, 0.225, -0.158], bevel: 0.004 },
  { kind: 'plate', material: 'accent', size: [0.18, 0.06, 0.014], at: [0, 0.235, -0.172], bevel: 0.003 },
  { kind: 'plate', material: 'glow', size: [0.13, 0.026, 0.012], at: [0, 0.235, -0.181], bevel: 0.002 },
  // the vent grilles: a red frame with three dark slats on each side
  {
    kind: 'plate',
    material: 'accent',
    size: [0.075, 0.085, 0.02],
    at: [0.105, 0.2, -0.158],
    bevel: 0.003,
    mirror: true,
  },
  ...[0.175, 0.2, 0.225].map((y): ProtoShape => ({
    kind: 'plate',
    material: 'frame',
    size: [0.055, 0.008, 0.012],
    at: [0.105, y, -0.171],
    bevel: 0.001,
    mirror: true,
  })),
  // the red strip on the upper right chest and its small lamp
  { kind: 'plate', material: 'accent', size: [0.055, 0.016, 0.012], at: [0.095, 0.29, -0.16], bevel: 0.001 },
  { kind: 'plate', material: 'glow', size: [0.008, 0.008, 0.008], at: [0.128, 0.29, -0.167], bevel: 0.001 },
  // the thick side plates, the collar and the red band under the lamp
  {
    kind: 'plate',
    material: 'armor',
    size: [0.07, 0.16, 0.17],
    at: [0.17, 0.21, 0],
    bevel: 0.008,
    taper: { top: 1.1, nose: 0.9 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.33, 0.06, 0.2],
    at: [0, 0.31, 0.012],
    bevel: 0.008,
    taper: { top: 0.85, front: 0.9, nose: 0.8 },
  },
  { kind: 'plate', material: 'accent', size: [0.15, 0.018, 0.012], at: [0, 0.155, -0.15], bevel: 0.001 },
];

// The boss's pauldron: a boxy plate over the shoulder drum, one size up from the player's, with the red rim and outer
// stripe. The left slot mirrors it.
const BOSS_SHOULDER: readonly ProtoShape[] = [
  { kind: 'tube', material: 'frame', axis: 'x', radius: 0.06, length: 0.14, at: [0.225, 0.3, 0.015] },
  { kind: 'ring', material: 'frame', axis: 'x', radius: 0.05, tube: 0.009, at: [0.3, 0.3, 0.015] },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.235, 0.2, 0.27],
    at: [0.305, 0.375, 0],
    bevel: 0.016,
    taper: { top: 0.9, front: 0.85, nose: 0.8, drop: 0.05 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.21, 0.05, 0.24],
    at: [0.305, 0.485, 0],
    bevel: 0.007,
    taper: { top: 0.85, front: 0.8, nose: 0.75 },
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.19, 0.045, 0.21],
    at: [0.305, 0.272, 0],
    bevel: 0.005,
    taper: { top: 0.9, front: 0.85, nose: 0.8 },
  },
  // the dark front and rear faces, and the red rim under the plate
  {
    kind: 'plate',
    material: 'frame',
    size: [0.11, 0.13, 0.03],
    at: [0.28, 0.37, -0.13],
    bevel: 0.004,
    taper: { front: 0.9, nose: 0.9 },
  },
  { kind: 'plate', material: 'frame', size: [0.13, 0.16, 0.03], at: [0.3, 0.375, 0.13], bevel: 0.004 },
  { kind: 'plate', material: 'accent', size: [0.2, 0.028, 0.23], at: [0.305, 0.286, 0], bevel: 0.003 },
  // the red stripe down the outer face and the small lit line beside it
  { kind: 'plate', material: 'accent', size: [0.012, 0.09, 0.2], at: [0.421, 0.38, 0], bevel: 0.002 },
  { kind: 'plate', material: 'glow', size: [0.005, 0.05, 0.006], at: [0.429, 0.38, -0.045], bevel: 0.001 },
];

// The six-cell missile pod over the boss's right shoulder (the three views' 超重装ミサイルポッド): two columns of three
// missiles, each rimmed in the type's red, in a cut housing under a shroud.
const BOSS_POD6: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'armor',
    size: [0.26, 0.22, 0.19],
    at: [0, 0, 0.03],
    bevel: 0.012,
    taper: { top: 0.9, front: 0.8, nose: 0.8 },
  },
  { kind: 'plate', material: 'frame', size: [0.25, 0.21, 0.02], at: [0, 0, -0.065], bevel: 0.004 },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.27, 0.03, 0.14],
    at: [0, 0.12, 0.02],
    bevel: 0.004,
    taper: { top: 0.85, front: 0.8 },
  },
  ...[-0.062, 0.062].flatMap(x =>
    [-0.07, 0, 0.07].flatMap((y): ProtoShape[] => [
      { kind: 'tube', material: 'frame', axis: 'z', radius: 0.026, length: 0.1, at: [x, y, -0.085] },
      { kind: 'ring', material: 'accent', axis: 'z', radius: 0.03, tube: 0.004, at: [x, y, -0.145] },
    ]),
  ),
  { kind: 'plate', material: 'accent', size: [0.012, 0.08, 0.09], at: [0.134, 0, 0.03], bevel: 0.001 },
];

// The cannon turret over the boss's left shoulder: a base, a pedestal, a housing with a long barrel and its red muzzle
// rim, and a sight above it. It is bound to the torso, over the pauldron.
const BOSS_TURRET: readonly ProtoShape[] = [
  { kind: 'plate', material: 'frame', size: [0.11, 0.07, 0.11], at: [0, 0, 0], bevel: 0.005 },
  { kind: 'tube', material: 'frame', axis: 'y', radius: 0.03, length: 0.08, at: [0, 0.07, 0] },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.14, 0.11, 0.2],
    at: [0, 0.15, 0.02],
    bevel: 0.008,
    taper: { top: 0.9, front: 0.85, nose: 0.8 },
  },
  { kind: 'plate', material: 'frame', size: [0.15, 0.09, 0.03], at: [0, 0.15, 0.13], bevel: 0.003 },
  { kind: 'plate', material: 'accent', size: [0.055, 0.015, 0.05], at: [0, 0.21, 0.02], bevel: 0.002 },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.02, length: 0.34, at: [0, 0.15, -0.22] },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.026, length: 0.05, at: [0, 0.15, -0.4] },
  { kind: 'ring', material: 'accent', axis: 'z', radius: 0.03, tube: 0.005, at: [0, 0.15, -0.43] },
  { kind: 'plate', material: 'frame', size: [0.025, 0.025, 0.075], at: [0, 0.22, -0.04], bevel: 0.002 },
];

// The boss's back: a tall pack with three red-lit grilles, the shoulder blocks, two exhausts with red rims and the belt's
// port on the right. The long loop of the belt is part of the gun, so it swings with the arm.
const BOSS_BACK: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'armor',
    size: [0.33, 0.26, 0.15],
    at: [0, 0.24, 0.19],
    bevel: 0.014,
    taper: { top: 0.95, front: 0.9, nose: 0.85, drop: 0.05 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.24, 0.08, 0.12],
    at: [0, 0.385, 0.19],
    bevel: 0.007,
    taper: { top: 0.8, front: 0.85, nose: 0.8 },
  },
  ...[-0.09, 0, 0.09].flatMap((x): ProtoShape[] => [
    { kind: 'plate', material: 'frame', size: [0.06, 0.16, 0.02], at: [x, 0.24, 0.272], bevel: 0.003 },
    { kind: 'plate', material: 'glow', size: [0.022, 0.11, 0.01], at: [x, 0.24, 0.284], bevel: 0.001 },
  ]),
  {
    kind: 'plate',
    material: 'armor',
    size: [0.07, 0.15, 0.11],
    at: [0.16, 0.27, 0.18],
    bevel: 0.006,
    mirror: true,
  },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.035, length: 0.07, at: [-0.09, 0.08, 0.28] },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.035, length: 0.07, at: [0.09, 0.08, 0.28] },
  { kind: 'ring', material: 'accent', axis: 'z', radius: 0.04, tube: 0.006, at: [-0.09, 0.08, 0.33] },
  { kind: 'ring', material: 'accent', axis: 'z', radius: 0.04, tube: 0.006, at: [0.09, 0.08, 0.33] },
  { kind: 'plate', material: 'frame', size: [0.09, 0.11, 0.03], at: [0.15, 0.2, 0.29], bevel: 0.004 },
  { kind: 'ring', material: 'frame', axis: 'z', radius: 0.03, tube: 0.006, at: [0.15, 0.2, 0.31] },
];

const BOSS_EXHAUST: readonly Vec3[] = [
  [-0.09, 0.08, 0.33],
  [0.09, 0.08, 0.33],
];

// The boss's gun: an oversized gatling with a three-barrel cluster inside a red cover, a ringed barrel cage, an ammo drum
// under the receiver and the belt looping from the drum back to the pack's right port.
const BOSS_GATLING: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'frame',
    size: [0.13, 0.12, 0.28],
    at: [0, 0.01, -0.14],
    bevel: 0.01,
    taper: { top: 0.9, front: 0.85, nose: 0.85 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.09, 0.06, 0.18],
    at: [0, 0.08, -0.16],
    bevel: 0.005,
    taper: { top: 0.75, front: 0.75, nose: 0.7 },
  },
  { kind: 'tube', material: 'accent', axis: 'z', radius: 0.06, length: 0.14, at: [0, 0.02, -0.25] },
  { kind: 'ring', material: 'frame', axis: 'z', radius: 0.065, tube: 0.007, at: [0, 0.02, -0.32] },
  ...Array.from({ length: 3 }, (_, i): ProtoShape => {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 2;
    return {
      kind: 'tube',
      material: 'frame',
      axis: 'z',
      radius: 0.016,
      length: 0.3,
      at: [Math.cos(angle) * 0.032, 0.02 + Math.sin(angle) * 0.032, -0.5],
    };
  }),
  { kind: 'ring', material: 'frame', axis: 'z', radius: 0.05, tube: 0.006, at: [0, 0.02, -0.4] },
  { kind: 'ring', material: 'frame', axis: 'z', radius: 0.05, tube: 0.006, at: [0, 0.02, -0.62] },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.055, length: 0.04, at: [0, 0.02, -0.65] },
  // the ammo drum and its red ring
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.07, length: 0.16, at: [0.02, -0.1, -0.04] },
  { kind: 'ring', material: 'accent', axis: 'z', radius: 0.075, tube: 0.005, at: [0.02, -0.1, 0.04] },
  { kind: 'plate', material: 'accent', size: [0.05, 0.015, 0.04], at: [0, 0.09, -0.1], bevel: 0.002 },
  ...hose([0.06, -0.02, 0.03], [0.18, 0.08, 0.36], [-0.085, 0.15, 0.29], 8, 0.022),
];

// The boss's free hand: a heavy claw with three prongs and a thumb, in place of the skeleton's open palm.
const BOSS_CLAW: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'frame',
    size: [0.075, 0.07, 0.09],
    at: [-0.235, 0.025, -0.015],
    bevel: 0.007,
    taper: { front: 0.85, nose: 0.85 },
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.018, 0.02, 0.13],
    at: [-0.258, -0.01, -0.07],
    rot: [-0.25, 0, 0],
    bevel: 0.002,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.018, 0.02, 0.13],
    at: [-0.235, -0.012, -0.075],
    rot: [-0.25, 0, 0],
    bevel: 0.002,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.018, 0.02, 0.13],
    at: [-0.212, -0.01, -0.07],
    rot: [-0.25, 0, 0],
    bevel: 0.002,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.018, 0.02, 0.11],
    at: [-0.2, 0.03, -0.06],
    rot: [-0.2, 0, -0.5],
    bevel: 0.002,
  },
  { kind: 'plate', material: 'accent', size: [0.08, 0.018, 0.095], at: [-0.235, 0.05, -0.01], bevel: 0.002 },
];

// The other kits' heads. The sniper and the scout build on the three views' player head (ORTHO_HEAD): the sniper adds
// a brow and a side sensor; the scout a round lens and the wide radar panel. The enemy keeps the older prototype's head
// with three red eyes in place of the visor.
const SNIPER_HEAD: readonly ProtoShape[] = [
  ...ORTHO_HEAD,
  // the brow over the visor, and the small sensor on the right of the helmet
  { kind: 'plate', material: 'accent', size: [0.125, 0.018, 0.035], at: [0, 0.44, -0.06], bevel: 0.002 },
  { kind: 'plate', material: 'frame', size: [0.032, 0.042, 0.05], at: [0.065, 0.405, -0.025], bevel: 0.003 },
  { kind: 'plate', material: 'glow', size: [0.012, 0.02, 0.014], at: [0.073, 0.405, -0.052], bevel: 0.001 },
];

const SCOUT_HEAD: readonly ProtoShape[] = [
  ...ORTHO_HEAD,
  // the round camera lens on the visor
  { kind: 'ring', material: 'frame', axis: 'z', radius: 0.04, tube: 0.009, at: [0, 0.405, -0.081] },
  { kind: 'plate', material: 'glow', size: [0.032, 0.032, 0.012], at: [0, 0.405, -0.076], bevel: 0.002 },
  // the mast, its two stays and the wide radar panel over the head, tipped up toward the front
  { kind: 'plate', material: 'frame', size: [0.036, 0.04, 0.04], at: [0, 0.462, 0.025], bevel: 0.003 },
  { kind: 'tube', material: 'frame', axis: 'y', radius: 0.012, length: 0.1, at: [0, 0.515, 0.025] },
  {
    kind: 'tube',
    material: 'frame',
    axis: 'y',
    radius: 0.006,
    length: 0.11,
    at: [0.075, 0.49, 0.015],
    rot: [0.1, 0, 0.18],
  },
  {
    kind: 'tube',
    material: 'frame',
    axis: 'y',
    radius: 0.006,
    length: 0.11,
    at: [-0.075, 0.49, 0.015],
    rot: [0.1, 0, -0.18],
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.32, 0.18, 0.018],
    at: [0, 0.575, 0.026],
    rot: [-0.24, 0, 0],
    bevel: 0.004,
    taper: { top: 0.82, front: 0.85, nose: 0.8 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.3, 0.16, 0.025],
    at: [0, 0.575, 0.012],
    rot: [-0.24, 0, 0],
    bevel: 0.006,
    taper: { top: 0.82, front: 0.85, nose: 0.8 },
  },
  {
    kind: 'plate',
    material: 'accent',
    size: [0.2, 0.02, 0.008],
    at: [0, 0.595, -0.002],
    rot: [-0.24, 0, 0],
    bevel: 0.001,
  },
];

const ENEMY_HEAD: readonly ProtoShape[] = [
  ...PLAYER_HEAD.filter(shape => shape.material !== 'glow'),
  // three eyes on the dark visor
  { kind: 'plate', material: 'glow', size: [0.024, 0.018, 0.014], at: [0, 0.405, -0.083], bevel: 0.002 },
  {
    kind: 'plate',
    material: 'glow',
    size: [0.018, 0.015, 0.014],
    at: [0.034, 0.405, -0.079],
    bevel: 0.002,
    mirror: true,
  },
];

// The torso ornaments. The sniper sets a slatted, orange-trimmed panel into the chest, the scout a light sensor panel
// with two vertical marks, and the enemy a red chest lamp and its side vents.
const SNIPER_TORSO: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'frame',
    size: [0.14, 0.125, 0.03],
    at: [0, 0.235, -0.134],
    bevel: 0.005,
    taper: { front: 0.9, nose: 0.9 },
  },
  ...[-0.028, 0.028].map((y): ProtoShape => ({
    kind: 'plate',
    material: 'armor',
    size: [0.11, 0.022, 0.014],
    at: [0, 0.235 + y, -0.152],
    bevel: 0.002,
  })),
  {
    kind: 'plate',
    material: 'accent',
    size: [0.012, 0.1, 0.012],
    at: [-0.052, 0.235, -0.154],
    bevel: 0.001,
    mirror: true,
  },
  { kind: 'plate', material: 'glow', size: [0.06, 0.01, 0.008], at: [0, 0.295, -0.15], bevel: 0.001 },
  // the side vents: a dark box with the type's orange band
  { kind: 'plate', material: 'frame', size: [0.02, 0.09, 0.12], at: [0.146, 0.22, 0], bevel: 0.005, mirror: true },
  { kind: 'plate', material: 'accent', size: [0.022, 0.07, 0.1], at: [0.153, 0.22, 0], bevel: 0.005, mirror: true },
];

const SCOUT_TORSO: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'armor',
    size: [0.14, 0.12, 0.026],
    at: [0, 0.235, -0.135],
    bevel: 0.004,
    taper: { top: 0.95, front: 0.9, nose: 0.9 },
  },
  { kind: 'plate', material: 'frame', size: [0.11, 0.085, 0.014], at: [0, 0.235, -0.152], bevel: 0.002 },
  { kind: 'plate', material: 'glow', size: [0.05, 0.02, 0.012], at: [0, 0.258, -0.162], bevel: 0.002 },
  {
    kind: 'plate',
    material: 'accent',
    size: [0.012, 0.08, 0.01],
    at: [-0.042, 0.235, -0.164],
    bevel: 0.001,
    mirror: true,
  },
  { kind: 'plate', material: 'accent', size: [0.05, 0.018, 0.01], at: [0, 0.298, -0.16], bevel: 0.001 },
  // the side vents: a dark box with the type's pale band
  { kind: 'plate', material: 'frame', size: [0.02, 0.09, 0.12], at: [0.146, 0.22, 0], bevel: 0.005, mirror: true },
  { kind: 'plate', material: 'accent', size: [0.022, 0.07, 0.1], at: [0.153, 0.22, 0], bevel: 0.005, mirror: true },
];

const ENEMY_TORSO: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'frame',
    size: [0.18, 0.12, 0.03],
    at: [0, 0.22, -0.125],
    bevel: 0.006,
    taper: { front: 0.8, nose: 0.8 },
  },
  { kind: 'plate', material: 'glow', size: [0.09, 0.018, 0.012], at: [0, 0.24, -0.145], bevel: 0.002 },
  { kind: 'plate', material: 'accent', size: [0.12, 0.018, 0.012], at: [0, 0.15, -0.13], bevel: 0.002 },
  {
    kind: 'plate',
    material: 'accent',
    size: [0.02, 0.06, 0.09],
    at: [0.146, 0.22, 0],
    bevel: 0.004,
    mirror: true,
  },
];

// The shoulders. `player` is the player's pauldron with the pod on the left; `pod` puts a missile pod over each
// shoulder for the enemy; `sniper` and `scout` are the three views' variants: the sniper's boxy pauldron with an orange
// vent, and the scout's pod with four missile tubes. The pods are bound to the torso, as the older player's was.
const RIGHT_POD = mirrorShapes(PLAYER_POD);
const POD_SHOULDER_PART: ProtoShoulderPart = {
  shapes: PLAYER_SHOULDER,
  onLeft: { shapes: PLAYER_POD, mount: PLAYER_BACK_MOUNT },
  onRight: { shapes: RIGHT_POD, mount: [-PLAYER_BACK_MOUNT[0], PLAYER_BACK_MOUNT[1], PLAYER_BACK_MOUNT[2]] },
};

const SNIPER_SHOULDER: readonly ProtoShape[] = [
  ...ORTHO_SHOULDER,
  // the vent on the front of the pauldron: an orange face with three dark slats
  { kind: 'plate', material: 'accent', size: [0.12, 0.036, 0.024], at: [0.28, 0.428, -0.106], bevel: 0.002 },
  ...[0.418, 0.428, 0.438].map((y): ProtoShape => ({
    kind: 'plate',
    material: 'frame',
    size: [0.095, 0.006, 0.008],
    at: [0.28, y, -0.119],
    bevel: 0.001,
  })),
  // the dark stripe down the outer face
  { kind: 'plate', material: 'frame', size: [0.012, 0.1, 0.08], at: [0.374, 0.35, -0.02], bevel: 0.002 },
];

const SCOUT_SHOULDER: readonly ProtoShape[] = [
  ...ORTHO_SHOULDER,
  // the pod's dark face and the four missile tubes in it
  { kind: 'plate', material: 'frame', size: [0.19, 0.15, 0.024], at: [0.28, 0.36, -0.111], bevel: 0.004 },
  ...[
    [0.235, 0.328],
    [0.325, 0.328],
    [0.235, 0.392],
    [0.325, 0.392],
  ].map(([x, y]): ProtoShape => ({
    kind: 'tube',
    material: 'frame',
    axis: 'z',
    radius: 0.023,
    length: 0.05,
    at: [x, y, -0.128],
  })),
  ...[
    [0.235, 0.328],
    [0.325, 0.328],
    [0.235, 0.392],
    [0.325, 0.392],
  ].map(([x, y]): ProtoShape => ({
    kind: 'ring',
    material: 'accent',
    axis: 'z',
    radius: 0.027,
    tube: 0.004,
    at: [x, y, -0.155],
  })),
];

// The friendly side's band and number (#551), on both shoulders: a pale green-teal band across the pauldron's front and
// the number on its outer face. The mark never joins a type's own colours, so a captured or borrowed mech still reads
// as the ally's until the band is off.
const ALLY_MARK_SNIPER: readonly ProtoShape[] = [
  { kind: 'plate', material: 'mark', size: [0.16, 0.034, 0.014], at: [0.28, 0.305, -0.128], bevel: 0.002 },
  { kind: 'plate', material: 'frame', size: [0.014, 0.08, 0.09], at: [0.378, 0.34, 0], bevel: 0.002 },
  { kind: 'plate', material: 'mark', size: [0.012, 0.06, 0.05], at: [0.386, 0.34, -0.01], bevel: 0.001 },
];

const ALLY_MARK_SCOUT: readonly ProtoShape[] = [
  { kind: 'plate', material: 'mark', size: [0.17, 0.03, 0.014], at: [0.28, 0.303, -0.132], bevel: 0.002 },
  { kind: 'plate', material: 'frame', size: [0.014, 0.08, 0.09], at: [0.378, 0.34, 0], bevel: 0.002 },
  { kind: 'plate', material: 'mark', size: [0.012, 0.06, 0.05], at: [0.386, 0.34, -0.01], bevel: 0.001 },
];

// The enemy's back: a block with three exhausts and the ammo belt running over the right shoulder to the gun.
const ENEMY_BACK: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'frame',
    size: [0.28, 0.2, 0.12],
    at: [0, 0.22, 0.16],
    bevel: 0.01,
    taper: { top: 1.05, front: 0.9, nose: 0.9 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.22, 0.1, 0.06],
    at: [0, 0.33, 0.2],
    bevel: 0.008,
    taper: { top: 0.85, front: 0.8, nose: 0.7 },
  },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.03, length: 0.09, at: [-0.08, 0.18, 0.26] },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.03, length: 0.09, at: [0.08, 0.18, 0.26] },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.03, length: 0.09, at: [0, 0.08, 0.26] },
  { kind: 'ring', material: 'accent', axis: 'z', radius: 0.034, tube: 0.005, at: [-0.08, 0.18, 0.31] },
  { kind: 'ring', material: 'accent', axis: 'z', radius: 0.034, tube: 0.005, at: [0.08, 0.18, 0.31] },
  { kind: 'ring', material: 'accent', axis: 'z', radius: 0.034, tube: 0.005, at: [0, 0.08, 0.31] },
  // the belt over the right shoulder and down to the gun
  {
    kind: 'tube',
    material: 'accent',
    axis: 'y',
    radius: 0.012,
    length: 0.24,
    at: [0.17, 0.31, 0.18],
    rot: [0.2, 0, -0.35],
  },
  {
    kind: 'tube',
    material: 'accent',
    axis: 'y',
    radius: 0.012,
    length: 0.18,
    at: [0.23, 0.2, 0.13],
    rot: [0.1, 0, -0.15],
  },
  { kind: 'plate', material: 'frame', size: [0.2, 0.06, 0.03], at: [0, 0.1, 0.225], bevel: 0.005 },
];

const ENEMY_EXHAUST: readonly Vec3[] = [
  [-0.08, 0.18, 0.31],
  [0.08, 0.18, 0.31],
  [0, 0.08, 0.31],
];

// The sniper's back: the three views' pack under a long whip antenna and a spare-barrel rack.
const SNIPER_BACK: readonly ProtoShape[] = [
  ...ORTHO_BACK,
  { kind: 'plate', material: 'armor', size: [0.16, 0.2, 0.022], at: [0, 0.26, 0.236], bevel: 0.004 },
  ...[0.21, 0.25, 0.29].map((y): ProtoShape => ({
    kind: 'plate',
    material: 'frame',
    size: [0.12, 0.012, 0.012],
    at: [0, y, 0.249],
    bevel: 0.001,
  })),
  { kind: 'plate', material: 'frame', size: [0.024, 0.03, 0.024], at: [0.15, 0.44, 0.15], bevel: 0.002 },
  { kind: 'tube', material: 'frame', axis: 'y', radius: 0.005, length: 0.22, at: [0.15, 0.565, 0.15] },
  { kind: 'plate', material: 'accent', size: [0.016, 0.014, 0.016], at: [0.15, 0.683, 0.15], bevel: 0.001 },
];

// The scout's back: a wide sensor array and the hose from the right shoulder down to the pack's left.
const SCOUT_BACK: readonly ProtoShape[] = [
  ...ORTHO_BACK,
  {
    kind: 'plate',
    material: 'armor',
    size: [0.22, 0.15, 0.04],
    at: [0, 0.33, 0.225],
    rot: [0.14, 0, 0],
    bevel: 0.005,
    taper: { top: 0.9, front: 0.85, nose: 0.85 },
  },
  { kind: 'plate', material: 'frame', size: [0.17, 0.1, 0.02], at: [0, 0.33, 0.248], rot: [0.14, 0, 0], bevel: 0.003 },
  {
    kind: 'plate',
    material: 'accent',
    size: [0.13, 0.018, 0.01],
    at: [0, 0.365, 0.258],
    rot: [0.14, 0, 0],
    bevel: 0.001,
  },
  { kind: 'plate', material: 'glow', size: [0.06, 0.012, 0.008], at: [0, 0.3, 0.258], rot: [0.14, 0, 0], bevel: 0.001 },
  ...hose([0.17, 0.33, 0.15], [0.02, 0.13, 0.3], [-0.17, 0.17, 0.2], 9, 0.016),
];

// The right hand's weapons. The player's autocannon is the prototype's; the sniper's rifle is long and scoped and the
// scout's scanner a box with a lit screen; the enemy's gatling carries six barrels around its axis.
const SNIPER_RIFLE: readonly ProtoShape[] = [
  // the receiver across the waist, held by both hands (the player cannon's hold), with its stock behind and mag below
  {
    kind: 'plate',
    material: 'armor',
    size: [0.34, 0.12, 0.17],
    at: [0.09, 0.06, -0.03],
    rot: [0, 0.1, -0.27],
    bevel: 0.01,
    taper: { top: 0.9, front: 0.85, nose: 0.85 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.24, 0.055, 0.12],
    at: [0.09, 0.125, -0.03],
    rot: [0, 0.1, -0.27],
    bevel: 0.006,
    taper: { top: 0.8, front: 0.75, nose: 0.7 },
  },
  {
    kind: 'plate',
    material: 'accent',
    size: [0.018, 0.012, 0.1],
    at: [-0.015, 0.13, -0.02],
    rot: [0, 0.1, -0.27],
    bevel: 0.002,
  },
  {
    kind: 'plate',
    material: 'accent',
    size: [0.018, 0.012, 0.1],
    at: [0.19, 0.13, -0.03],
    rot: [0, 0.1, -0.27],
    bevel: 0.002,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.05, 0.055, 0.1],
    at: [-0.04, 0.06, -0.03],
    rot: [0, 0.1, -0.27],
    bevel: 0.004,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.08, 0.11, 0.12],
    at: [0.1, -0.025, -0.02],
    rot: [0, 0.1, -0.27],
    bevel: 0.005,
    taper: { top: 1.1, front: 0.85, nose: 0.85 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.09, 0.08, 0.16],
    at: [0.08, 0.035, 0.14],
    rot: [0, 0.1, -0.27],
    bevel: 0.005,
    taper: { top: 0.9, front: 0.8, nose: 0.8 },
  },
  // the long barrel and its brake
  { kind: 'tube', material: 'armor', axis: 'z', radius: 0.018, length: 0.64, at: [0.16, 0.045, -0.53] },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.025, length: 0.09, at: [0.16, 0.045, -0.9] },
  { kind: 'ring', material: 'accent', axis: 'z', radius: 0.029, tube: 0.005, at: [0.16, 0.045, -0.95] },
  // the scope over the receiver, its lens facing forward
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.03, length: 0.26, at: [0.16, 0.19, -0.17] },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.035, length: 0.05, at: [0.16, 0.19, -0.3] },
  { kind: 'ring', material: 'glow', axis: 'z', radius: 0.03, tube: 0.005, at: [0.16, 0.19, -0.33] },
  { kind: 'plate', material: 'frame', size: [0.02, 0.06, 0.04], at: [0.16, 0.15, -0.06], bevel: 0.003 },
  // the bipod folded under the barrel
  {
    kind: 'tube',
    material: 'frame',
    axis: 'y',
    radius: 0.006,
    length: 0.14,
    at: [0.13, -0.02, -0.42],
    rot: [0.25, 0, 0.15],
  },
  {
    kind: 'tube',
    material: 'frame',
    axis: 'y',
    radius: 0.006,
    length: 0.14,
    at: [0.19, -0.02, -0.42],
    rot: [0.25, 0, -0.15],
  },
  {
    kind: 'plate',
    material: 'glow',
    size: [0.004, 0.006, 0.16],
    at: [0.08, 0.155, -0.06],
    rot: [0, 0.1, -0.27],
    bevel: 0.001,
  },
];

const SCANNER: readonly ProtoShape[] = [
  // the box in the hand, its lit screen on top, a second screen forward, and a whip antenna
  {
    kind: 'plate',
    material: 'frame',
    size: [0.09, 0.1, 0.18],
    at: [0, 0, -0.08],
    bevel: 0.008,
    taper: { top: 0.9, front: 0.8, nose: 0.8 },
  },
  { kind: 'plate', material: 'armor', size: [0.07, 0.05, 0.1], at: [0, 0.06, -0.12], bevel: 0.005 },
  { kind: 'plate', material: 'glow', size: [0.05, 0.016, 0.09], at: [0, 0.093, -0.1], bevel: 0.002 },
  { kind: 'plate', material: 'glow', size: [0.045, 0.035, 0.012], at: [0, 0.01, -0.185], bevel: 0.002 },
  { kind: 'plate', material: 'accent', size: [0.04, 0.012, 0.03], at: [0, 0.06, -0.06], bevel: 0.001 },
  { kind: 'plate', material: 'frame', size: [0.03, 0.08, 0.05], at: [0, -0.08, -0.03], bevel: 0.004 },
  { kind: 'tube', material: 'frame', axis: 'y', radius: 0.006, length: 0.1, at: [0.045, 0.15, -0.06] },
  { kind: 'ring', material: 'frame', axis: 'y', radius: 0.018, tube: 0.004, at: [0.045, 0.21, -0.06] },
];

// Six barrels around the gatling's axis: a ring of places, each a tube along z.
const GATLING_BARRELS: readonly ProtoShape[] = Array.from({ length: 6 }, (_, i) => {
  const angle = (i / 6) * Math.PI * 2;
  return {
    kind: 'tube',
    material: 'frame',
    axis: 'z',
    radius: 0.01,
    length: 0.4,
    at: [Math.cos(angle) * 0.03, 0.01 + Math.sin(angle) * 0.03, -0.55] as Vec3,
  };
});

const GATLING: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'frame',
    size: [0.09, 0.11, 0.26],
    at: [0, 0, -0.14],
    bevel: 0.009,
    taper: { top: 0.9, front: 0.8, nose: 0.8 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.07, 0.06, 0.18],
    at: [0, 0.07, -0.16],
    bevel: 0.006,
    taper: { top: 0.7, front: 0.7, nose: 0.6 },
  },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.045, length: 0.12, at: [0, 0.01, -0.3] },
  ...GATLING_BARRELS,
  { kind: 'ring', material: 'frame', axis: 'z', radius: 0.055, tube: 0.006, at: [0, 0.01, -0.36] },
  { kind: 'ring', material: 'frame', axis: 'z', radius: 0.055, tube: 0.006, at: [0, 0.01, -0.74] },
  { kind: 'plate', material: 'accent', size: [0.08, 0.02, 0.05], at: [0, 0.1, -0.18], bevel: 0.003 },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.06, 0.12, 0.08],
    at: [0, -0.12, -0.08],
    bevel: 0.007,
    taper: { top: 1.2, front: 0.8, nose: 0.8 },
  },
];

// The enemy gunner's pod over a shoulder (SB-2083): a cut housing with four missile tubes in a square, each rimmed in
// the type's red. The left pod mirrors it, so the two shoulders read as one pair.
const ENEMY_POD4: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'armor',
    size: [0.17, 0.14, 0.16],
    at: [0, 0, 0.03],
    bevel: 0.01,
    taper: { top: 0.9, front: 0.8, nose: 0.8 },
  },
  { kind: 'plate', material: 'frame', size: [0.16, 0.13, 0.02], at: [0, 0, -0.055], bevel: 0.004 },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.18, 0.03, 0.12],
    at: [0, 0.078, 0.02],
    bevel: 0.004,
    taper: { top: 0.85, front: 0.8 },
  },
  ...[
    [-0.04, 0.032],
    [0.04, 0.032],
    [-0.04, -0.032],
    [0.04, -0.032],
  ].flatMap(([x, y]): ProtoShape[] => [
    { kind: 'tube', material: 'frame', axis: 'z', radius: 0.024, length: 0.1, at: [x, y, -0.075] },
    { kind: 'ring', material: 'accent', axis: 'z', radius: 0.028, tube: 0.004, at: [x, y, -0.13] },
  ]),
  { kind: 'plate', material: 'accent', size: [0.01, 0.05, 0.08], at: [0.088, 0, 0.03], bevel: 0.001 },
];

// The heavy's six-tube pod: a wider housing with two columns of three missiles, so the one shoulder reads heavier than the
// gunner's pair (SB-2083).
const ENEMY_POD6: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'armor',
    size: [0.25, 0.2, 0.17],
    at: [0, 0, 0.03],
    bevel: 0.012,
    taper: { top: 0.9, front: 0.8, nose: 0.8 },
  },
  { kind: 'plate', material: 'frame', size: [0.24, 0.19, 0.02], at: [0, 0, -0.06], bevel: 0.004 },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.26, 0.03, 0.13],
    at: [0, 0.11, 0.02],
    bevel: 0.004,
    taper: { top: 0.85, front: 0.8 },
  },
  ...[-0.06, 0].flatMap(x =>
    [-0.06, 0, 0.06].flatMap((y): ProtoShape[] => [
      { kind: 'tube', material: 'frame', axis: 'z', radius: 0.025, length: 0.1, at: [x, y, -0.08] },
      { kind: 'ring', material: 'accent', axis: 'z', radius: 0.029, tube: 0.004, at: [x, y, -0.14] },
    ]),
  ),
  { kind: 'plate', material: 'accent', size: [0.01, 0.07, 0.09], at: [0.128, 0, 0.03], bevel: 0.001 },
];

// The rifleman's back: the gunner's pack with the round dish antenna over its left side (SB-2083).
const ENEMY_RIFLE_BACK: readonly ProtoShape[] = [
  ...ENEMY_BACK,
  { kind: 'tube', material: 'frame', axis: 'y', radius: 0.008, length: 0.16, at: [-0.13, 0.4, 0.19] },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.14, 0.012, 0.1],
    at: [-0.13, 0.49, 0.15],
    rot: [0.5, 0, 0],
    bevel: 0.002,
    taper: { top: 0.8, front: 0.8 },
  },
  {
    kind: 'plate',
    material: 'accent',
    size: [0.08, 0.01, 0.05],
    at: [-0.13, 0.495, 0.145],
    rot: [0.5, 0, 0],
    bevel: 0.001,
  },
  { kind: 'ring', material: 'frame', axis: 'y', radius: 0.02, tube: 0.004, at: [-0.13, 0.325, 0.19] },
];

// The heavy's chest (SB-2083): the enemy torso's red lamp and vents under a broad slab, with thick side plates and a
// collar, so the machine reads as a wide block without changing the shared skeleton.
const ENEMY_HEAVY_TORSO: readonly ProtoShape[] = [
  ...ENEMY_TORSO,
  {
    kind: 'plate',
    material: 'armor',
    size: [0.31, 0.17, 0.06],
    at: [0, 0.22, -0.125],
    bevel: 0.01,
    taper: { front: 0.9, nose: 0.9 },
  },
  { kind: 'plate', material: 'frame', size: [0.22, 0.12, 0.02], at: [0, 0.22, -0.162], bevel: 0.003 },
  { kind: 'plate', material: 'accent', size: [0.14, 0.025, 0.012], at: [0, 0.24, -0.172], bevel: 0.002 },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.06, 0.16, 0.16],
    at: [0.17, 0.21, 0],
    bevel: 0.008,
    taper: { top: 1.1, nose: 0.9 },
    mirror: true,
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.34, 0.06, 0.2],
    at: [0, 0.31, 0.01],
    bevel: 0.008,
    taper: { top: 0.85, front: 0.9, nose: 0.8 },
  },
  { kind: 'plate', material: 'accent', size: [0.16, 0.02, 0.01], at: [0, 0.15, -0.15], bevel: 0.001 },
];

// The enemy's rifle (SB-2083): a short receiver held at the waist by both hands, with a stock, a box magazine, one barrel
// and a plain sight. The sniper's long rifle is the same hold with a scope and a bipod; this one is the line soldier's.
const ENEMY_RIFLE: readonly ProtoShape[] = [
  {
    kind: 'plate',
    material: 'frame',
    size: [0.32, 0.12, 0.16],
    at: [0.09, 0.06, -0.03],
    rot: [0, 0.1, -0.27],
    bevel: 0.01,
    taper: { top: 0.9, front: 0.85, nose: 0.85 },
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.22, 0.05, 0.12],
    at: [0.09, 0.125, -0.03],
    rot: [0, 0.1, -0.27],
    bevel: 0.006,
    taper: { top: 0.8, front: 0.75, nose: 0.7 },
  },
  {
    kind: 'plate',
    material: 'accent',
    size: [0.018, 0.012, 0.1],
    at: [-0.015, 0.13, -0.02],
    rot: [0, 0.1, -0.27],
    bevel: 0.002,
  },
  {
    kind: 'plate',
    material: 'accent',
    size: [0.018, 0.012, 0.1],
    at: [0.19, 0.13, -0.03],
    rot: [0, 0.1, -0.27],
    bevel: 0.002,
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.05, 0.055, 0.1],
    at: [-0.04, 0.06, -0.03],
    rot: [0, 0.1, -0.27],
    bevel: 0.004,
  },
  {
    kind: 'plate',
    material: 'armor',
    size: [0.08, 0.12, 0.1],
    at: [0.1, -0.03, -0.02],
    rot: [0, 0.1, -0.27],
    bevel: 0.005,
    taper: { top: 1.1, front: 0.85, nose: 0.85 },
  },
  {
    kind: 'plate',
    material: 'frame',
    size: [0.09, 0.08, 0.16],
    at: [0.08, 0.035, 0.14],
    rot: [0, 0.1, -0.27],
    bevel: 0.005,
    taper: { top: 0.9, front: 0.8, nose: 0.8 },
  },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.015, length: 0.38, at: [0.16, 0.045, -0.36] },
  { kind: 'tube', material: 'frame', axis: 'z', radius: 0.021, length: 0.06, at: [0.16, 0.045, -0.57] },
  { kind: 'ring', material: 'accent', axis: 'z', radius: 0.024, tube: 0.004, at: [0.16, 0.045, -0.605] },
  { kind: 'plate', material: 'frame', size: [0.02, 0.04, 0.06], at: [0.16, 0.135, -0.08], bevel: 0.002 },
  { kind: 'plate', material: 'glow', size: [0.004, 0.006, 0.1], at: [0.08, 0.155, -0.06], bevel: 0.001 },
];

// The left pod mirrors the right, so a pair of pods reads as one design and its stripe faces outward; the heavy's one pod
// is on the left.
const ENEMY_POD4_L = mirrorShapes(ENEMY_POD4);
const ENEMY_POD6_L = mirrorShapes(ENEMY_POD6);

// The named part tables. The keys are the names a kit writes; the values are what the model builds.
export const PROTO_HEADS = {
  player: { shapes: ORTHO_HEAD },
  sniper: { shapes: SNIPER_HEAD },
  scout: { shapes: SCOUT_HEAD },
  enemy: { shapes: ENEMY_HEAD },
  boss: { shapes: BOSS_HEAD },
} as const satisfies Record<string, ProtoHeadPart>;
export type ProtoHeadId = keyof typeof PROTO_HEADS;

export const PROTO_TORSOS = {
  player: { shapes: ORTHO_TORSO },
  sniper: { shapes: SNIPER_TORSO },
  scout: { shapes: SCOUT_TORSO },
  enemy: { shapes: ENEMY_TORSO },
  enemyHeavy: { shapes: ENEMY_HEAVY_TORSO },
  boss: { shapes: BOSS_TORSO },
} as const satisfies Record<string, ProtoTorsoPart>;
export type ProtoTorsoId = keyof typeof PROTO_TORSOS;

export const PROTO_SHOULDERS = {
  player: { shapes: ORTHO_SHOULDER } satisfies ProtoShoulderPart,
  sniper: { shapes: SNIPER_SHOULDER } satisfies ProtoShoulderPart,
  scout: { shapes: SCOUT_SHOULDER } satisfies ProtoShoulderPart,
  allySniper: { shapes: [...SNIPER_SHOULDER, ...ALLY_MARK_SNIPER] } satisfies ProtoShoulderPart,
  allyScout: { shapes: [...SCOUT_SHOULDER, ...ALLY_MARK_SCOUT] } satisfies ProtoShoulderPart,
  pod: POD_SHOULDER_PART,
  // SB-2083: the gunner carries a four-tube pod over each shoulder, the rifleman one over its right, and the heavy a
  // six-tube pod over its left. The pods are bound to the torso, as the player's is.
  enemyGunner: {
    shapes: PLAYER_SHOULDER,
    onLeft: { shapes: ENEMY_POD4_L, mount: [-0.36, 0.4, 0.02] },
    onRight: { shapes: ENEMY_POD4, mount: [0.36, 0.4, 0.02] },
  } satisfies ProtoShoulderPart,
  enemyRifle: {
    shapes: PLAYER_SHOULDER,
    onRight: { shapes: ENEMY_POD4, mount: [0.35, 0.43, 0.02] },
  } satisfies ProtoShoulderPart,
  enemyHeavy: {
    shapes: ORTHO_SHOULDER,
    onLeft: { shapes: ENEMY_POD6_L, mount: [-0.41, 0.43, 0.02] },
  } satisfies ProtoShoulderPart,
  // SB-2084: the boss's boxy pauldron with the six-cell pod over its right shoulder and the cannon turret over its left
  boss: {
    shapes: BOSS_SHOULDER,
    onRight: { shapes: BOSS_POD6, mount: [0.4, 0.52, 0.08] },
    onLeft: { shapes: BOSS_TURRET, mount: [-0.36, 0.4, 0.0] },
  } satisfies ProtoShoulderPart,
} as const satisfies Record<string, ProtoShoulderPart>;
export type ProtoShoulderId = keyof typeof PROTO_SHOULDERS;

export const PROTO_BACKS = {
  ortho: {
    shapes: ORTHO_BACK,
    exhaust: [
      [-0.12, 0.12, 0.28],
      [0.12, 0.12, 0.28],
    ],
  },
  sniper: {
    shapes: SNIPER_BACK,
    exhaust: [
      [-0.12, 0.12, 0.28],
      [0.12, 0.12, 0.28],
    ],
  },
  scout: {
    shapes: SCOUT_BACK,
    exhaust: [
      [-0.12, 0.12, 0.28],
      [0.12, 0.12, 0.28],
    ],
  },
  enemy: { shapes: ENEMY_BACK, exhaust: ENEMY_EXHAUST },
  enemyRifle: { shapes: ENEMY_RIFLE_BACK, exhaust: ENEMY_EXHAUST },
  boss: { shapes: BOSS_BACK, exhaust: BOSS_EXHAUST },
} as const satisfies Record<string, ProtoBackPart>;
export type ProtoBackId = keyof typeof PROTO_BACKS;

export const PROTO_WEAPONS = {
  player: {
    hand: PLAYER_WEAPON_HAND,
    shapes: ORTHO_WEAPON,
    mount: [0, 0, 0],
    muzzle: [0.16, 0.035, -0.7],
  },
  sniper: {
    hand: PLAYER_WEAPON_HAND,
    shapes: SNIPER_RIFLE,
    mount: [0, 0, 0],
    muzzle: [0.16, 0.045, -0.96],
  },
  scanner: { hand: PLAYER_WEAPON_HAND, shapes: SCANNER, mount: [0.235, 0.03, -0.1] },
  gatling: { hand: PLAYER_WEAPON_HAND, shapes: GATLING, mount: PLAYER_ARM_MOUNT },
  // the gunner's gatling hangs from the right hand itself, not the older kit's outboard mount (SB-2083)
  enemyGatling: { hand: PLAYER_WEAPON_HAND, shapes: GATLING, mount: [0, 0.09, -0.12] },
  enemyRifle: {
    hand: PLAYER_WEAPON_HAND,
    shapes: ENEMY_RIFLE,
    mount: [0, 0, 0],
    muzzle: [0.16, 0.045, -0.62],
  },
  // SB-2084: the boss's gatling, held at the waist like the gunner's, with the ammo belt looping back to the pack
  bossGatling: {
    hand: PLAYER_WEAPON_HAND,
    shapes: BOSS_GATLING,
    mount: [0.09, 0.07, -0.04],
    muzzle: [0.122, 0.02, -0.68],
  },
} as const satisfies Record<string, ProtoWeaponPart>;
export type ProtoWeaponId = keyof typeof PROTO_WEAPONS;

// The free hands a kit can choose (SB-2084). A kit that names none keeps the skeleton's open palm.
export const PROTO_HANDS = {
  claw: { shapes: BOSS_CLAW },
} as const satisfies Record<string, ProtoHandPart>;
export type ProtoHandId = keyof typeof PROTO_HANDS;

// A kit: one name for each slot and the palette it wears. The skeleton is common; a kit only changes the parts. A kit
// may also swap the free hand (handL) and stand a size larger (scale, SB-2084's boss), which multiplies the height.
export interface ProtoKit {
  palette: ProtoPaletteId;
  head: ProtoHeadId;
  torso: ProtoTorsoId;
  shoulderR: ProtoShoulderId;
  shoulderL: ProtoShoulderId;
  back: ProtoBackId;
  weapon: ProtoWeaponId;
  handL?: ProtoHandId; // the free hand, when the kit does not wear the skeleton's open palm
  scale?: number; // how much larger than the height it is built at (1 when left out)
  arms?: ProtoArmPose; // the hold, when the weapon needs both hands
}

// The kits the confirmation view shows (?kit=...). The three enemy roles are here so the view can compare them with the
// three-view drawings (SB-2083), and the boss with its own (SB-2084); the allies' two kits are kept out, because their
// band and number (#551) are the friendly side's, not a paint the player chooses.
export const PROTO_KIT_IDS = [
  'player',
  'ally',
  'sniper',
  'scout',
  'enemy',
  'enemyRifle',
  'enemyGunner',
  'enemyHeavy',
  'boss',
] as const;
export type ProtoKitId = (typeof PROTO_KIT_IDS)[number];
export const PROTO_ALLY_KIT_IDS = ['allySniper', 'allyScout'] as const;
export type ProtoAllyKitId = (typeof PROTO_ALLY_KIT_IDS)[number];
// The enemies' three roles (SB-2083). They are not offered as the player's paint in the confirmation view; the enemy
// view (#view-grunts) builds them.
export const PROTO_ENEMY_KIT_IDS = ['enemyRifle', 'enemyGunner', 'enemyHeavy'] as const;
export type ProtoEnemyKitId = (typeof PROTO_ENEMY_KIT_IDS)[number];
export type ProtoKitName = ProtoKitId | ProtoAllyKitId | ProtoEnemyKitId;

// The player's own kit is the prototype exactly: its parts, its colours and its silhouette. `ally` is the same machine
// in the bright paint and the yellow/orange of the friendly side; the other kits read the three views' variants.
export const PROTO_KITS: Record<ProtoKitName, ProtoKit> = {
  player: {
    palette: 'player',
    head: 'player',
    torso: 'player',
    shoulderR: 'player',
    shoulderL: 'player',
    back: 'ortho',
    weapon: 'player',
    arms: { offShoulder: 1.05, leftIn: 0.75 },
  },
  ally: {
    palette: 'ally',
    head: 'player',
    torso: 'player',
    shoulderR: 'player',
    shoulderL: 'player',
    back: 'ortho',
    weapon: 'player',
    arms: { offShoulder: 1.05, leftIn: 0.75 },
  },
  sniper: {
    palette: 'sniper',
    head: 'sniper',
    torso: 'sniper',
    shoulderR: 'sniper',
    shoulderL: 'sniper',
    back: 'sniper',
    weapon: 'sniper',
    arms: { offShoulder: 1.05, leftIn: 0.75 },
  },
  scout: {
    palette: 'scout',
    head: 'scout',
    torso: 'scout',
    shoulderR: 'scout',
    shoulderL: 'scout',
    back: 'scout',
    weapon: 'scanner',
  },
  // the allies' two types: the same parts in the same colours, with the friendly side's band and number
  allySniper: {
    palette: 'sniper',
    head: 'sniper',
    torso: 'sniper',
    shoulderR: 'allySniper',
    shoulderL: 'allySniper',
    back: 'sniper',
    weapon: 'sniper',
    arms: { offShoulder: 1.05, leftIn: 0.75 },
  },
  allyScout: {
    palette: 'scout',
    head: 'scout',
    torso: 'scout',
    shoulderR: 'allyScout',
    shoulderL: 'allyScout',
    back: 'scout',
    weapon: 'scanner',
  },
  enemy: {
    // confirmation view only (#view-mech?kit=enemy): the game's enemies wear the three kits below
    palette: 'enemy',
    head: 'enemy',
    torso: 'enemy',
    shoulderR: 'pod',
    shoulderL: 'pod',
    back: 'enemy',
    weapon: 'gatling',
  },
  // SB-2083: the three views' enemies. The rifleman is the small machine (three eyes, a rifle, the three exhausts); the
  // gunner the one with a four-tube pod on each shoulder and the gatling; the heavy the medium machine, wider in the chest
  // and the shoulders, with a six-tube pod over its left shoulder and the rifle held by both hands.
  enemyRifle: {
    palette: 'enemy',
    head: 'enemy',
    torso: 'enemy',
    shoulderR: 'enemyRifle',
    shoulderL: 'enemyRifle',
    back: 'enemyRifle',
    weapon: 'enemyRifle',
    arms: { offShoulder: 1.05, leftIn: 0.75 },
  },
  enemyGunner: {
    palette: 'enemy',
    head: 'enemy',
    torso: 'enemy',
    shoulderR: 'enemyGunner',
    shoulderL: 'enemyGunner',
    back: 'enemy',
    weapon: 'enemyGatling',
    arms: { offShoulder: 0.95, leftIn: 0.55 },
  },
  enemyHeavy: {
    palette: 'enemy',
    head: 'enemy',
    torso: 'enemyHeavy',
    shoulderR: 'enemyHeavy',
    shoulderL: 'enemyHeavy',
    back: 'enemy',
    weapon: 'enemyRifle',
    arms: { offShoulder: 1.05, leftIn: 0.75 },
  },
  // SB-2084: the three views' boss, the heavy command machine of M1's second half. Black armour with the type's red, one
  // size larger than the line mechs, with the six-cell pod, the shoulder turret, the oversized gatling and the claw.
  boss: {
    palette: 'boss',
    head: 'boss',
    torso: 'boss',
    shoulderR: 'boss',
    shoulderL: 'boss',
    back: 'boss',
    weapon: 'bossGatling',
    handL: 'claw',
    scale: 1.18,
    arms: { offShoulder: 0.9, leftIn: 0.1 },
  },
};

export const PROTO_DEFAULT_KIT: ProtoKitId = 'player';

// The pictures' size and the numbers painted on them (view/mechProtoSurfaces.ts): one repeat of a picture covers this
// many metres of plate, and the seams and the bolts stand this deep. The plates are small, so a shorter repeat keeps
// the seams on every one of them; the big markings are geometry (the chest chevron and the orange bands), not the
// picture, so they stay in one or two places.
export const MECH_PROTO_TEX = {
  size: { armor: 512, frame: 512, accent: 256 }, // a painted picture's side (px)
  tile: { armor: 1.0, frame: 0.8, accent: 0.6 }, // metres one repeat covers
  seed: { armor: 146901, frame: 146902, accent: 146903 }, // the pictures' starting point
  normal: 10, // the panel lines' and bolts' depth
  grime: { armor: 24, frame: 22, accent: 10 }, // blotches a picture takes
  rivets: { armor: 14, frame: 20, accent: 6 }, // rivet heads a picture takes
  scratches: { armor: 16, frame: 24, accent: 8 },
  stripePitch: 96,
};

// The numbers of the prototype's look: the chamfer every plate takes when it does not name one, the round shapes'
// segments, the stance and the motion, the body's proportions, the flame's size, and the light and shadow the
// confirmation view adds around it.
export const PROTO_TUNE = {
  bevel: 0.008, // a plate's chamfer when it names none (ratio of the height)
  bevelSegments: 1, // layers in a chamfer
  // The smallest shape a `far` build keeps, as a ratio of the height (SB-2083): the bolts, the small rims and the thin lit
  // lines are left out, so a crowd of distant machines costs fewer triangles.
  farShape: 0.12,
  roundSegments: 12, // a tube's and a piston's sides
  ringSegments: 18, // a ring's sides
  // A `far` build's round shapes, cut coarser (SB-2086): at that distance the sides no longer show, and the crowd's
  // triangles are what the frame notices.
  farRoundSegments: 6,
  farRingSegments: 6,
  // The stance and the motion (SB-1471, 仮): the hips drop and the knees fold, the torso tips forward while the head
  // stays level, the weapon arm comes up and the free arm follows. Walking adds a swing, a knee lift and a bob; a stop
  // dips once; the air folds the knees and tucks the feet; a shot lowers the elbow and the hips; standing breathes.
  pose: {
    hip: 0.5, // the hip's height when standing (ratio of the mech's height; 1471 had 0.48)
    knee: 0.85, // the knee's flex when standing (rad; 1471 had 1.05, which looked folded from the side)
    lean: -0.22, // the torso's standing tilt (rad; negative tips the top toward -z)
    head: 0.8, // how much the head stays level against the torso's tilt (0..1)
    shoulder: 0.8, // the weapon arm's shoulder forward (rad)
    elbow: 0.58, // the weapon arm's elbow flex (rad); the shoulder's turn less this keeps the gun level
    offShoulder: 0.55, // the free arm's shoulder forward (rad)
    offElbow: 0.45, // the free arm's elbow flex (rad)
    stance: 0.28, // how far each leg splays out from the hip, so the feet sit about shoulder width (rad)
    stride: 0.6, // how much of the walk's swing the legs take (0..1)
    kneeWalk: 0.45, // the extra knee flex while a leg swings forward (rad)
    bob: 0.008, // how far the hip drops at the walk's lowest point (ratio)
    settle: 0.012, // the dip as the walk dies away (ratio)
    air: 0.8, // the extra knee flex in the air (rad)
    airLift: 0.1, // how far the feet tuck up in the air (ratio)
    recoilElbow: 0.3, // the elbow's dip when the gun fires (rad)
    recoilSink: 0.012, // the hip's dip when the gun fires (ratio)
    idleRate: 1.7, // the breathing's speed (rad/s)
    idleBob: 0.003, // the breathing's rise and fall (ratio)
    idleLean: 0.01, // the breathing's lean (rad)
  },
  // The body's proportions the panel can change; 1 is the 1469 shape. The legs stretch from the hip, the torso widens
  // about its middle line, and the limbs thicken about their own axis.
  build: {
    legLength: 1,
    torsoWidth: 1,
    limbGirth: 1,
  },
  flame: { radius: 0.018, opacity: 0.65 }, // the boost's flame: its radius (ratio of the height) and opacity
  light: {
    key: { at: [-1.3, 2.5, -2], intensity: 0.4 }, // the sun that casts the shadow (at, in heights from the mech)
    rim: { at: [1.3, 1.4, 1.7], intensity: 0.3 }, // the light along the back edge
    fill: { at: [2.2, 1.2, -1.8], intensity: 0.25 }, // the soft light that lifts the shadow side
    shadow: { extent: 1.5, near: 0.2, far: 6, bias: -0.0008, mapSize: 1024 }, // the sun's shadow camera, in heights
    env: 1.0, // the surroundings' light on the metal
  },
};
