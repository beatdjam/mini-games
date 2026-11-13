// The prototype of M1's mech (SB-1468): the E medium built for density, the way MechWarrior and War Robots build theirs
// (layered beveled plates, thin joints, pistons and pipes, big weapons, a cast shadow and a metal sheen). It is a second
// table beside M1_MECH (data/mech.ts), so the sortie's mech stays as it is until a player has seen this one.
// The ratios are the same as the other table's: of the mech's height, the feet at y = 0, the front toward -z and the
// right toward +x; the legs are measured from the ground and the rest from the hip top. Every value here is provisional.
import type { Vec3 } from './mech.ts';

// The materials of the prototype. The colours are MECH_PROTO_COLOR (data/colors.ts); `paint` picks the picture
// view/mechProtoSurfaces.ts paints for it, and `emissive` above 0 turns the material into a light.
export type ProtoMaterial = 'armor' | 'frame' | 'weapon' | 'accent' | 'sensor' | 'lamp';

export interface ProtoMaterialDef {
  metalness: number;
  roughness: number;
  emissive: number; // the emissive light's strength; 0 is a plain metal
  envMapIntensity: number; // how much of the surroundings' light it catches
}

export const PROTO_MATERIALS: Record<ProtoMaterial, ProtoMaterialDef> = {
  armor: { metalness: 0.3, roughness: 0.68, emissive: 0, envMapIntensity: 0.55 },
  frame: { metalness: 0.8, roughness: 0.5, emissive: 0, envMapIntensity: 0.7 },
  weapon: { metalness: 0.85, roughness: 0.35, emissive: 0, envMapIntensity: 0.8 },
  accent: { metalness: 0.3, roughness: 0.6, emissive: 0, envMapIntensity: 0.4 },
  sensor: { metalness: 0.1, roughness: 0.25, emissive: 1.6, envMapIntensity: 0.3 },
  lamp: { metalness: 0.1, roughness: 0.3, emissive: 1.2, envMapIntensity: 0.3 },
};

// The shapes a part is made of. A plate is a chamfered box; a tube, a ring, a piston and a ring of bolts are round.
// `size` is a plate's [width, height, depth], `radius` a round shape's, `length` a tube's or a piston's along its axis,
// `tube` a ring's thickness and `bolt` a bolt's radius. Only the fields a shape's kind uses are written.
export type ProtoShapeKind = 'plate' | 'tube' | 'ring' | 'piston' | 'bolts';

export interface ProtoShape {
  kind: ProtoShapeKind;
  material: ProtoMaterial;
  at: Vec3; // the shape's centre, as a ratio of the mech's height
  size?: Vec3; // plate
  bevel?: number; // plate: the chamfer's width (PROTO_TUNE.bevel when left out)
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

export const MECH_PROTO: ProtoParts = {
  hipY: 0.45,
  gait: 'biped',
  legs: [
    // the foot: a broad sole, a heel block and an armoured toe
    { kind: 'plate', material: 'frame', size: [0.18, 0.05, 0.34], at: [0.12, 0.025, -0.03], bevel: 0.02, mirror: true },
    { kind: 'plate', material: 'frame', size: [0.12, 0.09, 0.1], at: [0.12, 0.055, 0.13], bevel: 0.02, mirror: true },
    { kind: 'plate', material: 'armor', size: [0.16, 0.07, 0.12], at: [0.12, 0.055, -0.16], bevel: 0.02, mirror: true },
    {
      kind: 'plate',
      material: 'frame',
      size: [0.14, 0.04, 0.06],
      at: [0.12, 0.04, -0.215],
      bevel: 0.014,
      mirror: true,
    },
    // the ankle: a drum with a ring of bolts on its outer face
    { kind: 'tube', material: 'frame', axis: 'x', radius: 0.055, length: 0.16, at: [0.12, 0.11, 0], mirror: true },
    {
      kind: 'bolts',
      material: 'frame',
      axis: 'x',
      radius: 0.065,
      count: 6,
      bolt: 0.009,
      at: [0.2, 0.11, 0],
      mirror: true,
    },
    // the shin: a beveled armour shell, a front plate and a calf, braced by a piston
    { kind: 'plate', material: 'armor', size: [0.13, 0.23, 0.16], at: [0.12, 0.24, 0.01], bevel: 0.02, mirror: true },
    { kind: 'plate', material: 'armor', size: [0.1, 0.19, 0.045], at: [0.12, 0.25, -0.09], bevel: 0.014, mirror: true },
    { kind: 'plate', material: 'frame', size: [0.08, 0.16, 0.08], at: [0.12, 0.21, 0.105], bevel: 0.014, mirror: true },
    // the knee: a wide drum, a ring on the outside, the kneecap
    { kind: 'tube', material: 'frame', axis: 'x', radius: 0.075, length: 0.17, at: [0.12, 0.36, -0.005], mirror: true },
    { kind: 'ring', material: 'frame', axis: 'x', radius: 0.055, tube: 0.012, at: [0.205, 0.36, -0.005], mirror: true },
    {
      kind: 'bolts',
      material: 'frame',
      axis: 'x',
      radius: 0.036,
      count: 6,
      bolt: 0.008,
      at: [0.207, 0.36, -0.005],
      mirror: true,
    },
    { kind: 'plate', material: 'armor', size: [0.12, 0.09, 0.07], at: [0.12, 0.37, -0.09], bevel: 0.02, mirror: true },
    // the thigh: a shell, an outer plate and a front guard, with the hip drum above
    { kind: 'plate', material: 'armor', size: [0.13, 0.16, 0.15], at: [0.12, 0.425, 0.01], bevel: 0.02, mirror: true },
    { kind: 'plate', material: 'armor', size: [0.035, 0.14, 0.12], at: [0.19, 0.42, 0], bevel: 0.012, mirror: true },
    { kind: 'plate', material: 'frame', size: [0.08, 0.1, 0.05], at: [0.12, 0.42, -0.075], bevel: 0.012, mirror: true },
    { kind: 'tube', material: 'frame', axis: 'x', radius: 0.07, length: 0.16, at: [0.12, 0.47, 0.015], mirror: true },
    // the hydraulics down the back of the leg, and a cable beside them
    {
      kind: 'piston',
      material: 'frame',
      axis: 'y',
      radius: 0.017,
      length: 0.2,
      at: [0.16, 0.25, 0.075],
      rot: [0.12, 0, 0],
      mirror: true,
    },
    {
      kind: 'piston',
      material: 'frame',
      axis: 'y',
      radius: 0.015,
      length: 0.17,
      at: [0.16, 0.44, 0.08],
      rot: [-0.18, 0, 0],
      mirror: true,
    },
    { kind: 'tube', material: 'frame', axis: 'y', radius: 0.009, length: 0.3, at: [0.175, 0.27, 0.055], mirror: true },
  ],
  core: [
    // the waist: a drum to the legs, a bolt ring and the pelvis plates
    { kind: 'tube', material: 'frame', axis: 'y', radius: 0.08, length: 0.07, at: [0, 0.02, 0] },
    { kind: 'bolts', material: 'frame', axis: 'y', radius: 0.09, count: 8, bolt: 0.009, at: [0, 0.055, 0] },
    { kind: 'plate', material: 'armor', size: [0.26, 0.1, 0.2], at: [0, 0.085, 0], bevel: 0.025 },
    { kind: 'plate', material: 'frame', size: [0.2, 0.06, 0.05], at: [0, 0.09, -0.11], bevel: 0.012 },
    { kind: 'plate', material: 'frame', size: [0.24, 0.1, 0.18], at: [0, 0.165, 0], bevel: 0.02 },
    // the chest: a big shell with a stepped front plate, the cockpit window and a lamp at each side
    { kind: 'plate', material: 'armor', size: [0.32, 0.16, 0.24], at: [0, 0.27, 0], bevel: 0.03 },
    { kind: 'plate', material: 'armor', size: [0.26, 0.12, 0.05], at: [0, 0.28, -0.135], bevel: 0.02 },
    { kind: 'plate', material: 'armor', size: [0.22, 0.055, 0.045], at: [0, 0.2, -0.13], bevel: 0.014 },
    { kind: 'plate', material: 'sensor', size: [0.09, 0.03, 0.02], at: [0, 0.3, -0.168] },
    { kind: 'plate', material: 'lamp', size: [0.025, 0.025, 0.02], at: [0.13, 0.34, -0.12], mirror: true },
    // the sides: a striped vent sunk in a frame
    { kind: 'plate', material: 'frame', size: [0.02, 0.1, 0.14], at: [0.181, 0.245, 0], bevel: 0.006, mirror: true },
    { kind: 'plate', material: 'accent', size: [0.03, 0.08, 0.12], at: [0.19, 0.245, 0], bevel: 0.008, mirror: true },
    // the back: a plate and three ribs over it
    { kind: 'plate', material: 'frame', size: [0.26, 0.15, 0.05], at: [0, 0.27, 0.13], bevel: 0.014 },
    { kind: 'tube', material: 'frame', axis: 'x', radius: 0.012, length: 0.22, at: [0, 0.22, 0.155] },
    { kind: 'tube', material: 'frame', axis: 'x', radius: 0.012, length: 0.22, at: [0, 0.27, 0.155] },
    { kind: 'tube', material: 'frame', axis: 'x', radius: 0.012, length: 0.22, at: [0, 0.32, 0.155] },
    // the collar the head turns in
    { kind: 'plate', material: 'frame', size: [0.18, 0.05, 0.16], at: [0, 0.375, 0], bevel: 0.014 },
  ],
  arms: [
    // the shoulder: a drum with a bolted ring, under a big pauldron and a striped side plate
    { kind: 'tube', material: 'frame', axis: 'x', radius: 0.065, length: 0.16, at: [0.21, 0.36, 0.02], mirror: true },
    { kind: 'ring', material: 'frame', axis: 'x', radius: 0.06, tube: 0.013, at: [0.29, 0.36, 0.02], mirror: true },
    {
      kind: 'bolts',
      material: 'frame',
      axis: 'x',
      radius: 0.04,
      count: 8,
      bolt: 0.008,
      at: [0.292, 0.36, 0.02],
      mirror: true,
    },
    { kind: 'plate', material: 'armor', size: [0.16, 0.14, 0.2], at: [0.255, 0.405, 0], bevel: 0.025, mirror: true },
    { kind: 'plate', material: 'armor', size: [0.14, 0.045, 0.16], at: [0.255, 0.48, 0], bevel: 0.014, mirror: true },
    { kind: 'plate', material: 'accent', size: [0.025, 0.09, 0.12], at: [0.338, 0.4, 0], bevel: 0.008, mirror: true },
    // the upper arm and its front plate
    { kind: 'plate', material: 'frame', size: [0.09, 0.14, 0.11], at: [0.23, 0.27, 0], bevel: 0.014, mirror: true },
    {
      kind: 'plate',
      material: 'armor',
      size: [0.11, 0.1, 0.045],
      at: [0.23, 0.275, -0.075],
      bevel: 0.012,
      mirror: true,
    },
    // the elbow drum and the ring on its outside
    { kind: 'tube', material: 'frame', axis: 'x', radius: 0.055, length: 0.13, at: [0.23, 0.19, 0], mirror: true },
    { kind: 'ring', material: 'frame', axis: 'x', radius: 0.05, tube: 0.01, at: [0.298, 0.19, 0], mirror: true },
    // the forearm, its outer plate and the fist
    { kind: 'plate', material: 'armor', size: [0.11, 0.15, 0.12], at: [0.23, 0.105, -0.01], bevel: 0.02, mirror: true },
    {
      kind: 'plate',
      material: 'armor',
      size: [0.035, 0.12, 0.1],
      at: [0.292, 0.11, -0.005],
      bevel: 0.01,
      mirror: true,
    },
    { kind: 'plate', material: 'frame', size: [0.09, 0.07, 0.1], at: [0.23, 0.015, -0.02], bevel: 0.012, mirror: true },
    // the hydraulics and the cable that run down the arm
    {
      kind: 'piston',
      material: 'frame',
      axis: 'y',
      radius: 0.014,
      length: 0.12,
      at: [0.285, 0.245, -0.055],
      rot: [0.1, 0, 0],
      mirror: true,
    },
    { kind: 'tube', material: 'frame', axis: 'y', radius: 0.008, length: 0.15, at: [0.2, 0.24, 0.06], mirror: true },
  ],
  back: [
    // the pack, the box on top and the two stacks the boost leaves by
    { kind: 'plate', material: 'frame', size: [0.3, 0.28, 0.16], at: [0, 0.27, 0.22], bevel: 0.025 },
    { kind: 'plate', material: 'armor', size: [0.24, 0.1, 0.12], at: [0, 0.45, 0.21], bevel: 0.02 },
    { kind: 'tube', material: 'frame', axis: 'y', radius: 0.045, length: 0.2, at: [0.14, 0.22, 0.29], mirror: true },
    { kind: 'ring', material: 'frame', axis: 'y', radius: 0.05, tube: 0.01, at: [0.14, 0.32, 0.29], mirror: true },
    { kind: 'plate', material: 'accent', size: [0.16, 0.05, 0.02], at: [0, 0.35, 0.305], bevel: 0.006 },
    // pipes over the pack's top and the hinge the pod sits on
    { kind: 'tube', material: 'frame', axis: 'x', radius: 0.012, length: 0.26, at: [0, 0.1, 0.22] },
    { kind: 'tube', material: 'frame', axis: 'x', radius: 0.012, length: 0.26, at: [0, 0.15, 0.22] },
    { kind: 'ring', material: 'frame', axis: 'x', radius: 0.04, tube: 0.01, at: [-0.2, 0.52, 0.06] },
  ],
  head: [
    // the neck's drum, the head's box, the sensor window under a brow, the lamps and the antenna
    { kind: 'tube', material: 'frame', axis: 'y', radius: 0.05, length: 0.06, at: [0, 0.4, -0.01] },
    { kind: 'plate', material: 'frame', size: [0.15, 0.1, 0.14], at: [0, 0.46, -0.01], bevel: 0.02 },
    { kind: 'plate', material: 'sensor', size: [0.11, 0.032, 0.02], at: [0, 0.462, -0.087] },
    { kind: 'plate', material: 'frame', size: [0.17, 0.03, 0.05], at: [0, 0.5, -0.07], bevel: 0.01 },
    { kind: 'plate', material: 'lamp', size: [0.02, 0.025, 0.025], at: [0.085, 0.445, -0.07], mirror: true },
    { kind: 'tube', material: 'frame', axis: 'x', radius: 0.025, length: 0.19, at: [0, 0.46, 0.01] },
    { kind: 'plate', material: 'frame', size: [0.02, 0.12, 0.02], at: [0.09, 0.55, 0.03] },
    { kind: 'plate', material: 'accent', size: [0.06, 0.02, 0.06], at: [0, 0.415, -0.06], bevel: 0.005 },
  ],
  armMount: [0.225, 0.14, -0.12],
  backMount: [-0.2, 0.52, 0.06],
  exhaust: [
    [-0.1, 0.1, 0.33],
    [0.1, 0.1, 0.33],
  ],
  main: {
    shapes: [
      // the receiver, the barrel's housing, a pair of barrels with a ring at each muzzle
      { kind: 'plate', material: 'weapon', size: [0.11, 0.13, 0.28], at: [0, 0, -0.14], bevel: 0.02 },
      { kind: 'tube', material: 'weapon', axis: 'z', radius: 0.05, length: 0.14, at: [0, 0, -0.32] },
      { kind: 'tube', material: 'weapon', axis: 'z', radius: 0.017, length: 0.4, at: [0.026, 0.015, -0.46] },
      { kind: 'tube', material: 'weapon', axis: 'z', radius: 0.017, length: 0.4, at: [-0.026, 0.015, -0.46] },
      { kind: 'ring', material: 'weapon', axis: 'z', radius: 0.023, tube: 0.007, at: [0.026, 0.015, -0.64] },
      { kind: 'ring', material: 'weapon', axis: 'z', radius: 0.023, tube: 0.007, at: [-0.026, 0.015, -0.64] },
      // the magazine under the receiver, the sight above it and the feed on its side
      { kind: 'plate', material: 'frame', size: [0.08, 0.16, 0.1], at: [0, -0.13, -0.06], bevel: 0.012 },
      { kind: 'plate', material: 'frame', size: [0.035, 0.05, 0.09], at: [0, 0.1, -0.12], bevel: 0.008 },
      { kind: 'tube', material: 'frame', axis: 'x', radius: 0.03, length: 0.12, at: [0.07, -0.02, -0.2] },
    ],
  },
  sub: {
    shapes: [
      // the pod on the left shoulder: three missile tubes and the hinge under it
      { kind: 'plate', material: 'weapon', size: [0.16, 0.16, 0.2], at: [0, 0.02, 0.06], bevel: 0.02 },
      { kind: 'tube', material: 'weapon', axis: 'z', radius: 0.03, length: 0.14, at: [-0.04, 0.06, 0.18] },
      { kind: 'tube', material: 'weapon', axis: 'z', radius: 0.03, length: 0.14, at: [0.04, 0.06, 0.18] },
      { kind: 'tube', material: 'weapon', axis: 'z', radius: 0.03, length: 0.14, at: [0, -0.03, 0.18] },
      { kind: 'plate', material: 'frame', size: [0.1, 0.08, 0.06], at: [0, 0.02, -0.06], bevel: 0.01 },
    ],
  },
};

// The pictures' size and the numbers painted on them (view/mechProtoSurfaces.ts): one repeat of a picture covers this
// many metres of plate, the seams and the bolts stand this deep, and the markings are the stencilled number and the
// small label (px in the picture). The text is the prototype's own, not a real unit's.
export const MECH_PROTO_TEX = {
  size: 512,
  tile: { armor: 1.8, frame: 1.2, weapon: 0.9, accent: 0.6 }, // metres one repeat covers
  seed: { armor: 146801, frame: 146802, weapon: 146803, accent: 146804 }, // the pictures' starting point
  normal: 2.4, // the panel lines' and bolts' depth
  grime: { armor: 30, frame: 26, weapon: 22, accent: 12 }, // blotches a picture takes
  rivets: { armor: 22, frame: 30, weapon: 16, accent: 8 }, // rivet heads a picture takes
  scratches: { armor: 24, frame: 30, weapon: 34, accent: 10 },
  stencil: 'E4',
  stencilSize: 78,
  label: 'SB 04',
  labelSize: 20,
  stripePitch: 64,
};

// The numbers of the prototype's look: the chamfer every plate takes when it does not name one, the round shapes'
// segments, the flame's size, and the light and shadow the confirmation view adds around it.
export const PROTO_TUNE = {
  bevel: 0.014, // a plate's chamfer when it names none (ratio of the height)
  bevelSegments: 1, // layers in a chamfer
  roundSegments: 12, // a tube's and a piston's sides
  ringSegments: 18, // a ring's sides
  flame: { radius: 0.022, opacity: 0.72 }, // the boost's flame: its radius (ratio of the height) and opacity
  light: {
    key: { at: [-1.3, 2.5, -2], intensity: 0.4 }, // the sun that casts the shadow (at, in heights from the mech)
    rim: { at: [1.3, 1.4, 1.7], intensity: 0.28 }, // the light along the back edge
    shadow: { extent: 1.4, near: 0.2, far: 6, bias: -0.0008, mapSize: 1024 }, // the sun's shadow camera, in heights
    env: 0.7, // the surroundings' light on the metal
  },
};
