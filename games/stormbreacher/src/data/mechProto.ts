// The prototype of M1's mech (SB-1468, second pass SB-1469): the E medium built for density, the way MechWarrior and
// War Robots build theirs, but cut to a cleaner silhouette: long legs, a high hip, a broad chest and shoulders over a
// narrow waist, plates that taper and are cut on a diagonal, two paints and an orange accent, and thin light lines.
// It is a second table beside M1_MECH (data/mech.ts), so the sortie's mech stays as it is until a player has seen this.
// The ratios are the same as the other table's: of the mech's height, the feet at y = 0, the front toward -z and the
// right toward +x; the legs are measured from the ground and the rest from the hip top. Every value here is provisional.
import type { Vec3 } from './mech.ts';

// The materials of the prototype. The colours are MECH_PROTO_COLOR (data/colors.ts); `paint` picks the picture
// view/mechProtoSurfaces.ts paints for it, and `emissive` above 0 turns the material into a light.
export type ProtoMaterial = 'armor' | 'frame' | 'accent' | 'glow';

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

export interface ProtoWeapon {
  shapes: readonly ProtoShape[]; // relative to the part's mount, like WEAPON_LOOK
}

// The prototype's parts. The legs stand on the ground; every other part's y is measured from the hip top.
export interface ProtoParts {
  hipY: number; // the hip top's height, as a ratio of the mech's height
  gait: 'biped';
  legs: readonly ProtoShape[];
  core: readonly ProtoShape[];
  arms: readonly ProtoShape[];
  back: readonly ProtoShape[];
  head: readonly ProtoShape[];
  armMount: Vec3; // where the main weapon hangs (ratio, from the hip top)
  backMount: Vec3; // where the sub weapon sits (ratio, from the hip top)
  exhaust: readonly Vec3[]; // where the boost's flame leaves, facing back (ratio, from the hip top)
  main: ProtoWeapon; // the autocannon on the right arm
  sub: ProtoWeapon; // the pod on the left shoulder
}

// Every plate below follows one diagonal: wide at the back and the top, narrowing and dropping toward the front, with
// the outer edge cut in. The legs are long (the hip sits at 0.55), the waist is narrow, and the chest and pauldrons
// spread wide over it, so the front and the side read as an inverted triangle on long legs.
export const MECH_PROTO: ProtoParts = {
  hipY: 0.55,
  gait: 'biped',
  legs: [
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
  ],
  core: [
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
    // the chest's angled side facets and the dark strip down its middle, so the front breaks into planes
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
    { kind: 'plate', material: 'frame', size: [0.018, 0.1, 0.018], at: [0, 0.225, -0.144], bevel: 0.003 },
    // the cockpit window and the lamps: one light material, so the lines and the windows stay one draw a part
    { kind: 'plate', material: 'frame', size: [0.12, 0.042, 0.012], at: [0, 0.245, -0.139], bevel: 0.003 },
    { kind: 'plate', material: 'glow', size: [0.095, 0.028, 0.012], at: [0, 0.245, -0.148], bevel: 0.002 },
    {
      kind: 'plate',
      material: 'glow',
      size: [0.012, 0.02, 0.012],
      at: [0.115, 0.28, -0.1],
      bevel: 0.002,
      mirror: true,
    },
    // the thin light lines down the chest's front edges and across the lower plate
    {
      kind: 'plate',
      material: 'glow',
      size: [0.005, 0.09, 0.006],
      at: [0.083, 0.23, -0.142],
      bevel: 0.001,
      mirror: true,
    },
    { kind: 'plate', material: 'glow', size: [0.09, 0.005, 0.005], at: [0, 0.155, -0.145], bevel: 0.001 },
    // the side vents: a dark box, an orange band, and the big chevron marking on the chest
    { kind: 'plate', material: 'frame', size: [0.018, 0.09, 0.12], at: [0.146, 0.22, 0], bevel: 0.005, mirror: true },
    { kind: 'plate', material: 'accent', size: [0.02, 0.07, 0.1], at: [0.153, 0.22, 0], bevel: 0.005, mirror: true },
    {
      kind: 'plate',
      material: 'accent',
      size: [0.11, 0.028, 0.006],
      at: [0.045, 0.19, -0.145],
      rot: [0, 0, -0.45],
      bevel: 0.002,
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
  ],
  arms: [
    // the shoulder: a drum and ring under a big pauldron, cut on its outer top and tipped outward, with a dark lower
    // rim, an orange band and a light line
    { kind: 'tube', material: 'frame', axis: 'x', radius: 0.055, length: 0.13, at: [0.215, 0.3, 0.015], mirror: true },
    { kind: 'ring', material: 'frame', axis: 'x', radius: 0.045, tube: 0.008, at: [0.285, 0.3, 0.015], mirror: true },
    {
      kind: 'plate',
      material: 'frame',
      size: [0.15, 0.04, 0.17],
      at: [0.265, 0.288, 0],
      rot: [0, 0, -0.1],
      bevel: 0.006,
      taper: { top: 1.0, front: 0.8, nose: 0.7 },
      mirror: true,
    },
    {
      kind: 'plate',
      material: 'armor',
      size: [0.17, 0.13, 0.2],
      at: [0.265, 0.345, 0],
      rot: [0, 0, -0.1],
      bevel: 0.014,
      taper: { top: 0.85, front: 0.75, nose: 0.6, drop: 0.16, cut: 0.38, cutSide: 'right' },
      mirror: true,
    },
    {
      kind: 'plate',
      material: 'armor',
      size: [0.14, 0.03, 0.16],
      at: [0.265, 0.415, 0],
      rot: [0, 0, -0.1],
      bevel: 0.006,
      taper: { top: 0.65, front: 0.6, nose: 0.5 },
      mirror: true,
    },
    {
      kind: 'plate',
      material: 'accent',
      size: [0.02, 0.07, 0.1],
      at: [0.338, 0.34, 0],
      rot: [0, 0, -0.1],
      bevel: 0.005,
      mirror: true,
    },
    {
      kind: 'plate',
      material: 'glow',
      size: [0.005, 0.05, 0.006],
      at: [0.339, 0.34, -0.055],
      rot: [0, 0, -0.1],
      bevel: 0.001,
      mirror: true,
    },
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
    // the forearm, its outer plate, a light line and the fist
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
    {
      kind: 'plate',
      material: 'frame',
      size: [0.075, 0.06, 0.08],
      at: [0.235, 0.025, -0.015],
      bevel: 0.007,
      taper: { front: 0.8, nose: 0.8 },
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
  ],
  back: [
    // the pack: layered plates that narrow forward, with the stacks splayed out and pipes over the top
    {
      kind: 'plate',
      material: 'frame',
      size: [0.26, 0.2, 0.1],
      at: [0, 0.22, 0.16],
      bevel: 0.01,
      taper: { top: 1.1, front: 0.9, nose: 0.85, drop: 0.09 },
    },
    {
      kind: 'plate',
      material: 'armor',
      size: [0.22, 0.12, 0.07],
      at: [0, 0.34, 0.19],
      bevel: 0.009,
      taper: { top: 0.9, front: 0.8, nose: 0.7, drop: 0.1 },
    },
    {
      kind: 'plate',
      material: 'armor',
      size: [0.18, 0.06, 0.12],
      at: [0, 0.42, 0.17],
      bevel: 0.006,
      taper: { top: 0.7, front: 0.7, nose: 0.6 },
    },
    {
      kind: 'plate',
      material: 'armor',
      size: [0.055, 0.15, 0.075],
      at: [0.11, 0.23, 0.222],
      bevel: 0.007,
      taper: { top: 1.1, front: 0.8, nose: 0.8, drop: 0.1 },
      mirror: true,
    },
    {
      kind: 'plate',
      material: 'armor',
      size: [0.15, 0.09, 0.025],
      at: [0, 0.2, 0.22],
      bevel: 0.007,
      taper: { top: 1.1, front: 0.9, nose: 0.9, drop: 0.1 },
    },
    {
      kind: 'tube',
      material: 'frame',
      axis: 'y',
      radius: 0.035,
      length: 0.14,
      at: [0.13, 0.19, 0.26],
      rot: [0, 0, -0.15],
      mirror: true,
    },
    {
      kind: 'ring',
      material: 'frame',
      axis: 'y',
      radius: 0.04,
      tube: 0.007,
      at: [0.141, 0.26, 0.26],
      rot: [0, 0, -0.15],
      mirror: true,
    },
    { kind: 'tube', material: 'frame', axis: 'x', radius: 0.007, length: 0.2, at: [0, 0.15, 0.19] },
    { kind: 'tube', material: 'frame', axis: 'x', radius: 0.007, length: 0.2, at: [0, 0.185, 0.2] },
    { kind: 'plate', material: 'accent', size: [0.12, 0.03, 0.012], at: [0, 0.29, 0.235], bevel: 0.004 },
    {
      kind: 'plate',
      material: 'glow',
      size: [0.005, 0.08, 0.005],
      at: [0.09, 0.25, 0.234],
      bevel: 0.001,
      mirror: true,
    },
  ],
  head: [
    // the neck, the wedged head, a dark visor frame under a brow, lamps and a short antenna
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
  ],
  armMount: [0.235, 0.09, -0.1],
  backMount: [-0.35, 0.36, 0.04],
  exhaust: [
    [-0.13, 0.12, 0.27],
    [0.13, 0.12, 0.27],
  ],
  main: {
    shapes: [
      // the receiver, a light shroud, the barrel's housing and a cluster of three barrels with a ring at each muzzle
      {
        kind: 'plate',
        material: 'frame',
        size: [0.08, 0.1, 0.24],
        at: [0, 0, -0.12],
        bevel: 0.009,
        taper: { top: 0.9, front: 0.8, nose: 0.85, drop: 0.08 },
      },
      {
        kind: 'plate',
        material: 'armor',
        size: [0.07, 0.06, 0.18],
        at: [0, 0.06, -0.15],
        bevel: 0.007,
        taper: { top: 0.7, front: 0.7, nose: 0.6, drop: 0.12 },
      },
      { kind: 'tube', material: 'frame', axis: 'z', radius: 0.04, length: 0.12, at: [0, 0.01, -0.28] },
      { kind: 'tube', material: 'frame', axis: 'z', radius: 0.012, length: 0.34, at: [0, 0.03, -0.44] },
      { kind: 'tube', material: 'frame', axis: 'z', radius: 0.012, length: 0.34, at: [0.026, -0.005, -0.44] },
      { kind: 'tube', material: 'frame', axis: 'z', radius: 0.012, length: 0.34, at: [-0.026, -0.005, -0.44] },
      { kind: 'ring', material: 'frame', axis: 'z', radius: 0.016, tube: 0.004, at: [0, 0.03, -0.61] },
      { kind: 'ring', material: 'frame', axis: 'z', radius: 0.016, tube: 0.004, at: [0.026, -0.005, -0.61] },
      { kind: 'ring', material: 'frame', axis: 'z', radius: 0.016, tube: 0.004, at: [-0.026, -0.005, -0.61] },
      // the cooling slits on the housing and the light line over the barrel
      {
        kind: 'plate',
        material: 'accent',
        size: [0.005, 0.03, 0.012],
        at: [0.041, 0.02, -0.23],
        bevel: 0.001,
        mirror: true,
      },
      {
        kind: 'plate',
        material: 'accent',
        size: [0.005, 0.03, 0.012],
        at: [0.041, 0, -0.25],
        bevel: 0.001,
        mirror: true,
      },
      { kind: 'plate', material: 'glow', size: [0.004, 0.006, 0.16], at: [0.03, 0.075, -0.28], bevel: 0.001 },
      // the magazine under the receiver, the sight above it and the feed on its side
      {
        kind: 'plate',
        material: 'frame',
        size: [0.06, 0.12, 0.08],
        at: [0, -0.12, -0.05],
        bevel: 0.007,
        taper: { top: 1.2, front: 0.8, nose: 0.8 },
      },
      {
        kind: 'plate',
        material: 'frame',
        size: [0.03, 0.04, 0.08],
        at: [0, 0.1, -0.1],
        bevel: 0.005,
        taper: { front: 0.7, nose: 0.7 },
      },
      { kind: 'tube', material: 'frame', axis: 'x', radius: 0.025, length: 0.1, at: [0.06, -0.01, -0.17] },
    ],
  },
  sub: {
    shapes: [
      // the pod on the left shoulder: a cut housing under an armour shroud, three forward missile tubes, slits and a
      // light line
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
    ],
  },
};

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
// segments, the flame's size, the standing lean, and the light and shadow the confirmation view adds around it.
export const PROTO_TUNE = {
  bevel: 0.008, // a plate's chamfer when it names none (ratio of the height)
  bevelSegments: 1, // layers in a chamfer
  roundSegments: 12, // a tube's and a piston's sides
  ringSegments: 18, // a ring's sides
  lean: -0.08, // the body's standing tilt forward (rad, negative tips the top toward -z)
  flame: { radius: 0.018, opacity: 0.65 }, // the boost's flame: its radius (ratio of the height) and opacity
  light: {
    key: { at: [-1.3, 2.5, -2], intensity: 0.4 }, // the sun that casts the shadow (at, in heights from the mech)
    rim: { at: [1.3, 1.4, 1.7], intensity: 0.3 }, // the light along the back edge
    fill: { at: [2.2, 1.2, -1.8], intensity: 0.25 }, // the soft light that lifts the shadow side
    shadow: { extent: 1.5, near: 0.2, far: 6, bias: -0.0008, mapSize: 1024 }, // the sun's shadow camera, in heights
    env: 1.0, // the surroundings' light on the metal
  },
};
